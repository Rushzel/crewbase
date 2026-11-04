import "server-only";
import path from "node:path";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { type Box, type Rgb, cropSquare, makeImage, sample, toTensor } from "./image";
import type { Point } from "./signals";

// The three models, loaded once per server process. Files come from scripts/fetch-face-models.mjs.
const DIR = path.join(process.cwd(), "models", "face");
const sessions = new Map<string, Promise<ort.InferenceSession>>();
function session(file: string) {
  if (!sessions.has(file)) {
    sessions.set(file, ort.InferenceSession.create(path.join(DIR, file), { logSeverityLevel: 3 }));
  }
  return sessions.get(file)!;
}

export const MODEL_VERSION = "opencv-sface-2021dec";

export async function decode(jpeg: Buffer, maxSide = 640): Promise<Rgb> {
  const { data, info } = await sharp(jpeg)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

// ---------- YuNet: find faces ----------

export type Face = { box: Box; score: number; landmarks: Point[] };

const YUNET = 640;

function iou(a: Box, b: Box) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
}

// Letterboxes the image into 640x640 (BGR, 0 to 255, as the model expects), runs it, and decodes the
// three strides: score = sqrt(class x objectness), boxes and the five points relative to each cell.
// Points: the person's right eye, left eye, nose tip, right and left mouth corners.
export async function detectFaces(img: Rgb, minScore = 0.7): Promise<Face[]> {
  const scale = YUNET / Math.max(img.width, img.height);
  const boxed = makeImage(YUNET, YUNET);
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        boxed.data[(y * YUNET + x) * 3 + c] = sample(img, (x + 0.5) / scale - 0.5, (y + 0.5) / scale - 0.5, c);
      }
    }
  }
  const s = await session("face_detection_yunet_2023mar.onnx");
  const out = await s.run({ input: new ort.Tensor("float32", toTensor(boxed, "bgr"), [1, 3, YUNET, YUNET]) });
  const faces: Face[] = [];
  for (const stride of [8, 16, 32]) {
    const cls = out[`cls_${stride}`].data as Float32Array;
    const obj = out[`obj_${stride}`].data as Float32Array;
    const bbox = out[`bbox_${stride}`].data as Float32Array;
    const kps = out[`kps_${stride}`].data as Float32Array;
    const cols = YUNET / stride;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.min(Math.max(cls[i], 0), 1) * Math.min(Math.max(obj[i], 0), 1));
      if (score < minScore) continue;
      const r = Math.floor(i / cols), c = i % cols;
      const cx = (c + bbox[i * 4]) * stride, cy = (r + bbox[i * 4 + 1]) * stride;
      const bw = Math.exp(bbox[i * 4 + 2]) * stride, bh = Math.exp(bbox[i * 4 + 3]) * stride;
      const landmarks: Point[] = [0, 1, 2, 3, 4].map((n) => [
        ((kps[i * 10 + n * 2] + c) * stride) / scale,
        ((kps[i * 10 + n * 2 + 1] + r) * stride) / scale,
      ]);
      faces.push({ box: { x: (cx - bw / 2) / scale, y: (cy - bh / 2) / scale, w: bw / scale, h: bh / scale }, score, landmarks });
    }
  }
  faces.sort((a, b) => b.score - a.score);
  const kept: Face[] = [];
  for (const f of faces) if (kept.every((k) => iou(k.box, f.box) < 0.3)) kept.push(f);
  return kept;
}

// ---------- Alignment and SFace: who it is ----------

// The standard 112x112 positions of the five points that SFace (like ArcFace) was trained on.
const TEMPLATE: Point[] = [
  [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041],
];

// Least-squares similarity transform (scale, rotation, shift) taking the face's points onto the
// template, then the inverse used to sample each output pixel from the frame.
export function alignFace(img: Rgb, landmarks: Point[], size = 112): Rgb {
  const n = landmarks.length;
  const ms = landmarks.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
  const md = TEMPLATE.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
  let a = 0, b = 0, norm = 0;
  for (let i = 0; i < n; i++) {
    const sx = landmarks[i][0] - ms[0], sy = landmarks[i][1] - ms[1];
    const dx = TEMPLATE[i][0] - md[0], dy = TEMPLATE[i][1] - md[1];
    a += sx * dx + sy * dy;
    b += sx * dy - sy * dx;
    norm += sx * sx + sy * sy;
  }
  const c = a / norm, s = b / norm;
  const tx = md[0] - (c * ms[0] - s * ms[1]);
  const ty = md[1] - (s * ms[0] + c * ms[1]);
  const k = c * c + s * s;
  const out = makeImage(size, size);
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const x = (c * (u - tx) + s * (v - ty)) / k;
      const y = (-s * (u - tx) + c * (v - ty)) / k;
      for (let ch = 0; ch < 3; ch++) out.data[(v * size + u) * 3 + ch] = Math.round(sample(img, x, y, ch));
    }
  }
  return out;
}

// 128 numbers describing the face, scaled to length 1, so cosine similarity is a dot product.
export async function embed(aligned: Rgb): Promise<number[]> {
  const s = await session("face_recognition_sface_2021dec.onnx");
  const out = await s.run({ data: new ort.Tensor("float32", toTensor(aligned, "rgb"), [1, 3, 112, 112]) });
  const v = Array.from(out.fc1.data as Float32Array);
  const len = Math.hypot(...v) || 1;
  return v.map((x) => x / len);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// ---------- MiniFASNet: a real face, or a photo or screen ----------

// The probability, from 0 to 1, that each face is a real person: a square crop 1.5 times the face box
// (edges mirrored), 128x128, RGB scaled to 0 to 1, as the model was trained.
export async function realScores(img: Rgb, faces: Box[]): Promise<number[]> {
  if (!faces.length) return [];
  const crops = faces.map((f) => cropSquare(img, f.x + f.w / 2, f.y + f.h / 2, Math.max(f.w, f.h) * 1.5, 128));
  const batch = new Float32Array(crops.length * 3 * 128 * 128);
  crops.forEach((c, i) => batch.set(toTensor(c, "rgb", 1 / 255), i * 3 * 128 * 128));
  const s = await session("antispoof_minifas_98.20.onnx");
  const out = await s.run({ input: new ort.Tensor("float32", batch, [crops.length, 3, 128, 128]) });
  const logits = out.output.data as Float32Array;
  return crops.map((_, i) => 1 / (1 + Math.exp(-(logits[i * 2] - logits[i * 2 + 1]))));
}
