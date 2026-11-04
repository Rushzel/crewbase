// The two liveness signals that need no model: a blink, and the face reflecting the screen's colours.
// Both are measured on frames the server received, so the phone can't simply report "passed".
import { type Box, type Rgb, cropSquare, hexToRgb, meanRgb } from "./image";

export type Point = [number, number];

// ---------- Blink ----------

// How "open" an eye looks: the share of clearly dark pixels (iris, pupil, lash line) in a small crop
// around the eye point. A closed eye shows mostly eyelid skin, so the share drops.
export function eyeOpenness(img: Rgb, eye: Point, faceWidth: number): number {
  const side = Math.max(8, faceWidth * 0.22);
  const crop = cropSquare(img, eye[0], eye[1], side, 24);
  const lum: number[] = [];
  for (let i = 0; i < 24 * 24; i++) {
    lum.push(0.299 * crop.data[i * 3] + 0.587 * crop.data[i * 3 + 1] + 0.114 * crop.data[i * 3 + 2]);
  }
  const sorted = [...lum].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return lum.filter((l) => l < median * 0.55).length / lum.length;
}

export type BlinkResult = { detected: boolean; depth: number };

// A blink is a dip in openness followed by a recovery: some frame well below the typical level,
// with open frames both before and after it. `depth` is the lowest frame relative to the typical one.
export function detectBlink(openness: number[], minDip = 0.55, recovered = 0.8): BlinkResult {
  if (openness.length < 5) return { detected: false, depth: 1 };
  const sorted = [...openness].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length * 0.75)];
  if (typical <= 0.01) return { detected: false, depth: 1 };
  const rel = openness.map((o) => o / typical);
  let low = 0;
  for (let i = 1; i < rel.length; i++) if (rel[i] < rel[low]) low = i;
  const depth = rel[low];
  const openBefore = rel.slice(0, low).some((r) => r >= recovered);
  const openAfter = rel.slice(low + 1).some((r) => r >= recovered);
  return { detected: depth <= minDip && openBefore && openAfter, depth };
}

// ---------- Flash ----------

function chroma([r, g, b]: [number, number, number]): [number, number, number] {
  const s = r + g + b || 1;
  return [r / s, g / s, b / s];
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export type FlashFrame = { img: Rgb; face: Box; color: string };
export type FlashResult = { faceScore: number; backgroundScore: number; response: number; passed: boolean };

// How closely the face's colour follows the colours the screen showed, as a correlation from -1 to 1,
// and the same for the background. A real face near a lit screen follows the sequence clearly and
// more than the room behind it does; a screen held up to the camera, or a recording made with
// another sequence, doesn't.
export function flashResponse(frames: FlashFrame[], minScore = 0.5, minLead = 0.15): FlashResult {
  if (frames.length < 4) return { faceScore: 0, backgroundScore: 0, response: 0, passed: false };
  const expected = frames.map((f) => chroma(hexToRgb(f.color)));
  const face = frames.map((f) => {
    // The middle of the face (cheeks, nose, forehead), away from hair and background.
    const { x, y, w, h } = f.face;
    return chroma(meanRgb(f.img, { x: x + w * 0.2, y: y + h * 0.15, w: w * 0.6, h: h * 0.6 }));
  });
  const background = frames.map((f) => {
    // Strips at the top corners, outside the face.
    const side = Math.max(4, Math.min(f.face.x, f.img.width - f.face.x - f.face.w, f.img.height * 0.25));
    const left = meanRgb(f.img, { x: 0, y: 0, w: side, h: side });
    const right = meanRgb(f.img, { x: f.img.width - side, y: 0, w: side, h: side });
    return chroma([(left[0] + right[0]) / 2, (left[1] + right[1]) / 2, (left[2] + right[2]) / 2]);
  });
  // Changes, not absolute colour: each channel is measured against its own average over the frames,
  // so skin's natural redness (or a warm room) doesn't swamp the flash.
  const flat = (rows: [number, number, number][]) =>
    [0, 1, 2].flatMap((c) => {
      const mean = rows.reduce((s, r) => s + r[c], 0) / rows.length;
      return rows.map((r) => r[c] - mean);
    });
  const faceScore = pearson(flat(expected), flat(face));
  const backgroundScore = pearson(flat(expected), flat(background));
  // How much the face's colour actually moved, in chromaticity units.
  const faceFlat = flat(face);
  const response = Math.sqrt(faceFlat.reduce((s, v) => s + v * v, 0) / faceFlat.length);
  return {
    faceScore,
    backgroundScore,
    response,
    passed: faceScore >= minScore && faceScore - backgroundScore >= minLead && response >= 0.004,
  };
}

// The colours a challenge may use: far apart in hue, so each step moves the skin's colour clearly.
export const FLASH_PALETTE = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff"];

// ---------- Capture schedule ----------

// The phone must follow the fixed capture schedule exactly: still pictures, then blink pictures, then
// two pictures per colour, in the challenge's order. Labels that don't fit are refused, so frames
// can't be rearranged to match a sequence after the fact.
export type Labelled = { phase: "still" | "blink" | "flash"; step?: number };

export function followsSchedule(frames: Labelled[], colorCount: number): boolean {
  const order = { still: 0, blink: 1, flash: 2 } as const;
  for (let i = 1; i < frames.length; i++) if (order[frames[i].phase] < order[frames[i - 1].phase]) return false;
  const still = frames.filter((f) => f.phase === "still").length;
  const blink = frames.filter((f) => f.phase === "blink").length;
  const flash = frames.filter((f) => f.phase === "flash");
  if (still < 2 || still > 6 || blink < 5 || blink > 30) return false;
  if (flash.length !== colorCount * 2) return false;
  return flash.every((f, i) => f.step === Math.floor(i / 2));
}
