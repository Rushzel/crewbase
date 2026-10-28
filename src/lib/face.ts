// Face capture and liveness in the browser, using @vladmandic/human.
// The browser only gathers evidence. The database checks the challenge, the timing, the match
// against the enrolled face and replays (see supabase/migrations/..._time.sql, verify_punch).
import type { Human, Config, FaceResult } from "@vladmandic/human";

export const MODEL_VERSION = "human-3.3-faceres";
export type Action = "blink" | "turn_left" | "turn_right" | "open_mouth";

export const ACTION_PROMPTS: Record<Action, string> = {
  blink: "Blink",
  turn_left: "Turn your head to your left",
  turn_right: "Turn your head to your right",
  open_mouth: "Open your mouth",
};

let humanPromise: Promise<Human> | null = null;

export function loadHuman(): Promise<Human> {
  humanPromise ??= (async () => {
    const { Human } = await import("@vladmandic/human");
    const config: Partial<Config> = {
      modelBasePath: "/models/",
      backend: "webgl",
      cacheSensitivity: 0,
      face: {
        enabled: true,
        detector: { rotation: true, maxDetected: 2, minConfidence: 0.5 },
        mesh: { enabled: true },
        iris: { enabled: true },
        description: { enabled: true },
        antispoof: { enabled: true },
        liveness: { enabled: true },
        emotion: { enabled: false },
      } as Config["face"],
      body: { enabled: false } as Config["body"],
      hand: { enabled: false } as Config["hand"],
      object: { enabled: false } as Config["object"],
      gesture: { enabled: true },
    };
    const human = new Human(config);
    await human.load();
    await human.warmup();
    return human;
  })();
  return humanPromise;
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

function gestureMatches(action: Action, gestures: string[]): boolean {
  switch (action) {
    case "blink":
      return gestures.some((g) => g.startsWith("blink"));
    case "turn_left":
      return gestures.includes("facing left");
    case "turn_right":
      return gestures.includes("facing right");
    case "open_mouth":
      return gestures.some((g) => {
        const m = /^mouth (\d+)% open$/.exec(g);
        return m !== null && Number(m[1]) >= 30;
      });
  }
}

export type LivenessResult = {
  passed: boolean;
  actions: Action[];
  duration_ms: number;
  real: number;
  live: number;
  embedding: number[] | null;
  reason?: string;
};

// Runs the server's challenge: the actions must happen in order, by one face that stays in view,
// within the time limit. Returns an embedding taken from a frame during the challenge.
export async function runChallenge(
  video: HTMLVideoElement,
  actions: Action[],
  onStep: (index: number, message: string) => void,
  timeLimitMs = 45_000,
): Promise<LivenessResult> {
  const human = await loadHuman();
  const started = performance.now();
  const done: Action[] = [];
  const reals: number[] = [];
  const lives: number[] = [];
  let embedding: number[] | null = null;
  let step = 0;
  let neutralSince = 0;
  onStep(0, ACTION_PROMPTS[actions[0]]);

  while (step < actions.length) {
    if (performance.now() - started > timeLimitMs) {
      return { passed: false, actions: done, duration_ms: Math.round(performance.now() - started), real: avg(reals), live: avg(lives), embedding, reason: "Took too long. Try again." };
    }
    const result = await human.detect(video);
    const faces = result.face as FaceResult[];
    if (faces.length !== 1) {
      onStep(step, faces.length === 0 ? "Keep your face in the frame" : "Only one face, please");
      await nextFrame();
      continue;
    }
    const face = faces[0];
    if (typeof face.real === "number") reals.push(face.real);
    if (typeof face.live === "number") lives.push(face.live);
    if (face.embedding && face.embedding.length > 0 && (face.faceScore ?? 0) > 0.8) embedding = Array.from(face.embedding);

    const gestures = result.gesture.filter((g) => "face" in g).map((g) => g.gesture as string);
    // Each action must start from a neutral pose, so one long head turn can't count twice.
    const isNeutral = gestures.includes("facing center") && !gestures.some((g) => g.startsWith("blink"));
    if (isNeutral && neutralSince === 0) neutralSince = performance.now();
    if (neutralSince > 0 && gestureMatches(actions[step], gestures)) {
      done.push(actions[step]);
      step += 1;
      neutralSince = 0;
      if (step < actions.length) onStep(step, `Good. Now: ${ACTION_PROMPTS[actions[step]].toLowerCase()}`);
    }
    await nextFrame();
  }

  const real = avg(reals);
  const live = avg(lives);
  const passed = real >= 0.5 && live >= 0.5 && embedding !== null;
  return {
    passed,
    actions: done,
    duration_ms: Math.round(performance.now() - started),
    real,
    live,
    embedding,
    reason: passed ? undefined : embedding === null ? "Couldn't get a clear view of your face." : "That didn't look like a live face. Try again in good light.",
  };
}

// Several clear embeddings for enrollment, taken while the person moves slightly.
export async function captureForEnrollment(video: HTMLVideoElement, count: number, onProgress: (n: number) => void): Promise<number[][]> {
  const human = await loadHuman();
  const out: number[][] = [];
  let lastAt = 0;
  while (out.length < count) {
    const result = await human.detect(video);
    const face = (result.face as FaceResult[])[0];
    if (result.face.length === 1 && face.embedding?.length && (face.faceScore ?? 0) > 0.85 && (face.real ?? 1) >= 0.5 && performance.now() - lastAt > 500) {
      out.push(Array.from(face.embedding));
      lastAt = performance.now();
      onProgress(out.length);
    }
    await nextFrame();
  }
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
