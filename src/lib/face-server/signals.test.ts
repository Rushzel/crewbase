import { describe, expect, it } from "vitest";
import { type Rgb, hexToRgb, makeImage } from "./image";
import { detectBlink, eyeOpenness, flashResponse, followsSchedule, type FlashFrame, type Labelled } from "./signals";

describe("capture schedule", () => {
  // What the capture screen sends: 3 still, about 18 blink, then 2 per colour in order.
  const good: Labelled[] = [
    ...Array.from({ length: 3 }, () => ({ phase: "still" as const })),
    ...Array.from({ length: 18 }, () => ({ phase: "blink" as const })),
    ...[0, 0, 1, 1, 2, 2, 3, 3, 4, 4].map((step) => ({ phase: "flash" as const, step })),
  ];

  it("accepts the capture screen's own order", () => {
    expect(followsSchedule(good, 5)).toBe(true);
  });

  it("refuses colour frames relabelled to fit the sequence", () => {
    const swapped = good.map((f, i) => (i === good.length - 1 ? { phase: "flash" as const, step: 0 } : f));
    expect(followsSchedule(swapped, 5)).toBe(false);
  });

  it("refuses frames moved between steps", () => {
    const moved = [...good.slice(0, 3), good[good.length - 1], ...good.slice(3, -1)];
    expect(followsSchedule(moved, 5)).toBe(false);
  });

  it("refuses extra or missing colour frames", () => {
    expect(followsSchedule([...good, { phase: "flash", step: 4 }], 5)).toBe(false);
    expect(followsSchedule(good.slice(0, -1), 5)).toBe(false);
  });

  it("refuses unknown labels, and steps on frames that aren't colour frames", () => {
    expect(followsSchedule([{ phase: "other" } as unknown as Labelled, ...good], 5)).toBe(false);
    expect(followsSchedule(good.map((f, i) => (i === 0 ? { phase: "still" as const, step: 0 } : f)), 5)).toBe(false);
    expect(followsSchedule(good.map((f, i) => (i === good.length - 1 ? { phase: "flash" as const, step: 4.5 } : f)), 5)).toBe(false);
  });

  it("refuses a check with too few still or blink frames", () => {
    expect(followsSchedule(good.filter((f) => f.phase !== "blink"), 5)).toBe(false);
  });
});

const W = 160, H = 160;
const FACE = { x: 40, y: 30, w: 80, h: 100 };
const SKIN: [number, number, number] = [182, 142, 120];
const WALL: [number, number, number] = [96, 98, 104];

// A synthetic frame: a wall, and a face-coloured box that reflects `reflect` of the screen's colour.
function frame(color: string, reflect: number, wallReflect = 0): Rgb {
  const img = makeImage(W, H);
  const c = hexToRgb(color);
  const mix = (base: [number, number, number], a: number) =>
    base.map((v, i) => Math.round(v * (1 - a) + c[i] * a)) as [number, number, number];
  const wall = mix(WALL, wallReflect);
  const face = mix(SKIN, reflect);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inFace = x >= FACE.x && x < FACE.x + FACE.w && y >= FACE.y && y < FACE.y + FACE.h;
      img.data.set(inFace ? face : wall, (y * W + x) * 3);
    }
  }
  return img;
}

const SEQUENCE = ["#ff0000", "#00ffff", "#0000ff", "#ffff00", "#00ff00"];
const frames = (shown: string[], reflected: string[], reflect: number, wallReflect = 0): FlashFrame[] =>
  shown.flatMap((color, i) => [0, 1].map(() => ({ img: frame(reflected[i], reflect, wallReflect), face: FACE, color })));

describe("flash liveness", () => {
  it("passes a face that reflects the colours in the order shown", () => {
    const r = flashResponse(frames(SEQUENCE, SEQUENCE, 0.12));
    expect(r.faceScore).toBeGreaterThan(0.9);
    expect(r.passed).toBe(true);
  });

  it("fails a screen held to the camera, which reflects nothing", () => {
    const r = flashResponse(frames(SEQUENCE, SEQUENCE, 0));
    expect(r.passed).toBe(false);
  });

  it("fails a recording made with another colour order", () => {
    const other = ["#00ff00", "#ff0000", "#ffff00", "#00ffff", "#0000ff"];
    const r = flashResponse(frames(SEQUENCE, other, 0.12));
    expect(r.faceScore).toBeLessThan(0.5);
    expect(r.passed).toBe(false);
  });

  it("fails when the whole picture shifts colour as much as the face (a tinted video, not a reflection)", () => {
    const r = flashResponse(frames(SEQUENCE, SEQUENCE, 0.12, 0.12));
    expect(r.passed).toBe(false);
  });

  it("needs enough frames to judge", () => {
    expect(flashResponse(frames(SEQUENCE.slice(0, 1), SEQUENCE.slice(0, 1), 0.12)).passed).toBe(false);
  });
});

// A synthetic eye: skin with a dark iris (open) or only a thin lash line (closed).
function eye(open: boolean): Rgb {
  const img = makeImage(100, 100, SKIN);
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      const dx = x - 50, dy = y - 50;
      const dark = open ? dx * dx + dy * dy < 7 * 7 : Math.abs(dy) < 1 && Math.abs(dx) < 10;
      if (dark) img.data.set([35, 30, 30], (y * 100 + x) * 3);
    }
  }
  return img;
}

describe("blink", () => {
  const openness = (pattern: boolean[]) => pattern.map((o) => eyeOpenness(eye(o), [50, 50], 100));

  it("sees an open eye as more open than a closed one", () => {
    expect(eyeOpenness(eye(true), [50, 50], 100)).toBeGreaterThan(eyeOpenness(eye(false), [50, 50], 100) * 2);
  });

  it("detects eyes closing and opening again", () => {
    const r = detectBlink(openness([true, true, true, false, false, true, true, true]));
    expect(r.detected).toBe(true);
    expect(r.depth).toBeLessThan(0.55);
  });

  it("does not count a stare", () => {
    expect(detectBlink(openness([true, true, true, true, true, true, true])).detected).toBe(false);
  });

  it("does not count eyes that close and never reopen (a photo of closed eyes, or looking away)", () => {
    expect(detectBlink(openness([true, true, true, false, false, false, false])).detected).toBe(false);
  });

  it("needs enough frames", () => {
    expect(detectBlink(openness([true, false, true])).detected).toBe(false);
  });
});
