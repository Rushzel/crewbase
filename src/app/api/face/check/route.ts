import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type CapturedFrame, runCheck } from "@/lib/face-server/check";
import { MODEL_VERSION } from "@/lib/face-server/models";

// Receives the frames the phone captured for a face challenge, checks them here on the server, and
// records the verdict with the server's key. The phone never reports a result of its own.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FRAMES = 40;
const MAX_BYTES = 400_000;
const MAX_UPLOAD = MAX_FRAMES * MAX_BYTES + 64_000;
const PHASES = new Set(["still", "blink", "flash"]);

function validMeta(value: unknown): value is { phase: CapturedFrame["phase"]; step?: number }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        m !== null && typeof m === "object" && PHASES.has(m.phase) &&
        (m.phase === "flash" ? Number.isInteger(m.step) : m.step === undefined) &&
        Object.keys(m).every((k) => k === "phase" || k === "step"),
    )
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return NextResponse.json({ passed: false, reason: "Sign in first" }, { status: 401 });

  // Refuse anything bigger than a full check before reading it.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!declared || declared > MAX_UPLOAD) {
    return NextResponse.json({ passed: false, reason: "The upload was too large; try again" }, { status: 413 });
  }
  const form = await request.formData();
  const challengeId = String(form.get("challenge") ?? "");
  const rawMeta = String(form.get("meta") ?? "");
  let meta: unknown = null;
  try {
    meta = rawMeta.length <= 4000 ? JSON.parse(rawMeta) : null;
  } catch {
    meta = null;
  }
  if (!validMeta(meta)) {
    return NextResponse.json({ passed: false, reason: "The pictures were incomplete; try again" }, { status: 400 });
  }
  const files = form.getAll("frame").filter((f): f is File => f instanceof File);
  if (!files.length || files.length !== meta.length || files.length > MAX_FRAMES || files.some((f) => f.size > MAX_BYTES)) {
    return NextResponse.json({ passed: false, reason: "The pictures were incomplete; try again" }, { status: 400 });
  }

  // The challenge must be the caller's own, unchecked and unexpired; this claims it (so it's checked once)
  // and gives the colours shown.
  const { data: challenge, error } = await supabase.rpc("face_challenge", { p_challenge: challengeId });
  if (error || !challenge) return NextResponse.json({ passed: false, reason: error?.message ?? "Challenge not found" }, { status: 400 });
  const c = challenge as { purpose: "clock" | "enroll"; colors: string[]; liveness_required: boolean };

  const frames: CapturedFrame[] = await Promise.all(
    files.map(async (f, i) => ({ jpeg: Buffer.from(await f.arrayBuffer()), phase: meta[i].phase, step: meta[i].step })),
  );
  let result;
  try {
    result = await runCheck(frames, c.colors, c.liveness_required);
  } catch {
    return NextResponse.json({ passed: false, reason: "The face check couldn't run; try again" }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: verdict, error: recordError } = await admin.rpc("record_face_check", {
    p_challenge: challengeId,
    p_user: userId,
    p_passed: result.passed,
    // A passed check has no reason and a failed one no embedding; the database takes nulls for both.
    p_reason: (result.reason ?? null) as string,
    p_embedding: (result.embedding ?? null) as number[],
    p_scores: { ...result.scores, still_frames: frames.filter((f) => f.phase === "still").length },
    p_model_version: MODEL_VERSION,
  });
  if (recordError) return NextResponse.json({ passed: false, reason: recordError.message }, { status: 400 });
  const v = verdict as { passed: boolean; reason: string | null };
  return NextResponse.json({ passed: v.passed, reason: v.reason, challenge: challengeId, purpose: c.purpose });
}
