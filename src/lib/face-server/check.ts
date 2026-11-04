import "server-only";
import type { Rgb } from "./image";
import { type Face, alignFace, cosine, decode, detectFaces, embed, realScores } from "./models";
import { detectBlink, eyeOpenness, flashResponse } from "./signals";

// One full check over the frames the phone captured for a challenge. Everything that decides the
// result happens here, on the server; the phone only took the pictures.

export type CapturedFrame = { jpeg: Buffer; phase: "still" | "blink" | "flash"; step?: number };

export type CheckResult = {
  passed: boolean;
  reason: string | null;
  embedding: number[] | null;
  scores: {
    frames: number;
    sameness: number | null;
    real: number | null;
    blink_depth: number | null;
    blink: boolean;
    flash: number | null;
    flash_lead: number | null;
    flash_ok: boolean;
  };
};

// Defaults are deliberately cautious until calibrated with real cameras (docs/FACE-V2.md).
export const LIMITS = { real: 0.6, sameness: 0.4, maxShift: 0.35 };

export async function runCheck(frames: CapturedFrame[], colors: string[], requireLiveness: boolean): Promise<CheckResult> {
  const scores: CheckResult["scores"] = {
    frames: frames.length, sameness: null, real: null, blink_depth: null, blink: false, flash: null, flash_lead: null, flash_ok: false,
  };
  const fail = (reason: string): CheckResult => ({ passed: false, reason, embedding: null, scores });

  const decoded: { img: Rgb; face: Face; phase: CapturedFrame["phase"]; step?: number }[] = [];
  for (const f of frames) {
    const img = await decode(f.jpeg);
    const faces = await detectFaces(img);
    if (faces.length === 0) return fail("no face in some pictures; keep your face inside the oval");
    if (faces.length > 1 && faces[1].score > 0.85) return fail("more than one face in the picture");
    decoded.push({ img, face: faces[0], phase: f.phase, step: f.step });
  }
  const still = decoded.filter((d) => d.phase === "still");
  if (still.length < 2) return fail("not enough pictures to check");

  // One face, kept in place: frames can't be stitched from different moments or people.
  const ref = still[0].face.box;
  for (const d of decoded) {
    const shift = Math.hypot(d.face.box.x + d.face.box.w / 2 - (ref.x + ref.w / 2), d.face.box.y + d.face.box.h / 2 - (ref.y + ref.h / 2));
    const size = d.face.box.w / ref.w;
    if (shift > ref.w * LIMITS.maxShift || size < 0.7 || size > 1.4) return fail("you moved too much; hold the phone still");
  }

  // Who it is: the still frames, plus one from the flash and one from the blink, must be one person.
  const sampleFrames = [...still, ...decoded.filter((d) => d.phase === "flash").slice(0, 1), ...decoded.filter((d) => d.phase === "blink").slice(0, 1)];
  const embeddings = await Promise.all(sampleFrames.map((d) => embed(alignFace(d.img, d.face.landmarks))));
  let sameness = 1;
  for (let i = 1; i < embeddings.length; i++) sameness = Math.min(sameness, cosine(embeddings[0], embeddings[i]));
  scores.sameness = sameness;
  if (sameness < LIMITS.sameness) return fail("the pictures don't all show the same person");
  const n = still.length;
  const mean = embeddings.slice(0, n).reduce((acc, e) => acc.map((v, i) => v + e[i] / n), new Array(128).fill(0));
  const len = Math.hypot(...mean) || 1;
  const embedding = mean.map((v) => v / len);

  // A real face, not a photo or a screen.
  const real = await Promise.all(still.map((d) => realScores(d.img, [d.face.box]).then((r) => r[0])));
  scores.real = real.reduce((s, v) => s + v, 0) / real.length;
  if (scores.real < LIMITS.real) return { ...fail("this looks like a photo or a screen, not a live face"), embedding: null };

  if (requireLiveness) {
    const blink = decoded.filter((d) => d.phase === "blink");
    const openness = blink.map((d) => {
      const [right, left] = d.face.landmarks;
      return (eyeOpenness(d.img, right, d.face.box.w) + eyeOpenness(d.img, left, d.face.box.w)) / 2;
    });
    const b = detectBlink(openness);
    scores.blink = b.detected;
    scores.blink_depth = b.depth;
    if (!b.detected) return fail("no blink seen; blink once when asked");

    const flash = decoded
      .filter((d) => d.phase === "flash" && d.step !== undefined && colors[d.step!])
      .map((d) => ({ img: d.img, face: d.face.box, color: colors[d.step!] }));
    const fl = flashResponse(flash);
    scores.flash = fl.faceScore;
    scores.flash_lead = fl.faceScore - fl.backgroundScore;
    scores.flash_ok = fl.passed;
    if (!fl.passed) return fail("the screen's colours didn't show on your face; raise the brightness and move out of direct sunlight");
  }

  return { passed: true, reason: null, embedding, scores };
}
