// Downloads the server's face models into models/face/ and checks each file's SHA-256, so a changed
// or swapped file is never used. Licences: YuNet MIT, SFace Apache 2.0 (OpenCV Zoo); MiniFASNet port
// Apache 2.0 (facenox/face-antispoof-onnx, based on Minivision's Silent-Face-Anti-Spoofing).
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const MODELS = [
  {
    file: "face_detection_yunet_2023mar.onnx",
    url: "https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx",
    sha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
  },
  {
    file: "face_recognition_sface_2021dec.onnx",
    url: "https://huggingface.co/opencv/face_recognition_sface/resolve/main/face_recognition_sface_2021dec.onnx",
    sha256: "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
  },
  {
    file: "antispoof_minifas_98.20.onnx",
    url: "https://raw.githubusercontent.com/facenox/face-antispoof-onnx/main/models/best/98.20/best_model.onnx",
    sha256: "af2381b88f38769222ed93379e12444e2a50814575de1c46170de570c55a42b6",
  },
];

const dir = new URL("../models/face/", import.meta.url);
await mkdir(dir, { recursive: true });
const hash = (buf) => createHash("sha256").update(buf).digest("hex");

for (const m of MODELS) {
  const target = new URL(m.file, dir);
  if (existsSync(target) && hash(await readFile(target)) === m.sha256) {
    console.log(`ok       ${m.file}`);
    continue;
  }
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`${m.file}: download failed with HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (hash(buf) !== m.sha256) throw new Error(`${m.file}: checksum does not match; refusing to use it`);
  await writeFile(target, buf);
  console.log(`fetched  ${m.file} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
