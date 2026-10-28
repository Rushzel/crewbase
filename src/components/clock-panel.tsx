"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { bestPosition, type Reading } from "@/lib/location";
import { ACTION_PROMPTS, type Action, runChallenge, startCamera, stopCamera, loadHuman } from "@/lib/face";
import { formatDuration } from "@/lib/format";
import type { Json } from "@/lib/database.types";

type Props = {
  orgId: string;
  sites: { id: string; name: string }[];
  openEntry: { id: string; status: string; clock_in: string; break_started?: string | null } | null;
  checks: { geofence: boolean; face: boolean; liveness: boolean; breaks: boolean };
  serverNow: string;
};

type Step = { kind: "idle" } | { kind: "busy"; message: string } | { kind: "camera"; message: string } | { kind: "done"; ok: boolean; message: string };

export function ClockPanel({ orgId, sites, openEntry, checks, serverNow }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [site, setSite] = useState(sites[0]?.id ?? "");
  const [step, setStep] = useState<Step>({ kind: "idle" });
  // Clock display: starts from the server's time and ticks locally. Recorded times always come from the database.
  const offset = useRef(new Date(serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => new Date(Date.now() + offset.current));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date(Date.now() + offset.current)), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => stopCamera(stream.current), []);
  useEffect(() => {
    if (checks.face) loadHuman().catch(() => undefined); // start downloading the models early
  }, [checks.face]);

  const elapsed = openEntry ? (now.getTime() - new Date(openEntry.clock_in).getTime()) / 60000 : 0;

  async function gatherEvidence() {
    let reading: Reading | null = null;
    if (checks.geofence) {
      setStep({ kind: "busy", message: "Finding your location…" });
      reading = await bestPosition();
    }
    let challengeId: string | null = null;
    let embedding: number[] | null = null;
    let liveness: Json | null = null;
    if (checks.face) {
      const { data: challenge, error } = await supabase.rpc("issue_clock_challenge", { p_org: orgId });
      if (error || !challenge) throw new Error(error?.message ?? "Couldn't start the face check.");
      const c = challenge as { id: string; actions: Action[] };
      challengeId = c.id;
      setStep({ kind: "camera", message: "Starting the camera…" });
      await new Promise((r) => setTimeout(r, 50));
      stream.current = await startCamera(video.current!);
      setStep({ kind: "camera", message: "Loading the face check…" });
      const result = await runChallenge(video.current!, c.actions, (_, message) => setStep({ kind: "camera", message }));
      stopCamera(stream.current);
      if (!result.passed && result.reason) throw new Error(result.reason);
      embedding = result.embedding;
      liveness = { passed: result.passed, actions: result.actions, duration_ms: result.duration_ms, real: result.real, live: result.live };
    }
    return { reading, challengeId, embedding, liveness };
  }

  async function punch(kind: "in" | "out") {
    try {
      const ev = await gatherEvidence();
      setStep({ kind: "busy", message: kind === "in" ? "Timing in…" : "Timing out…" });
      const common = {
        p_lat: ev.reading?.lat, p_lng: ev.reading?.lng, p_accuracy_m: ev.reading?.accuracy, p_age_s: ev.reading?.ageSeconds,
        p_challenge: ev.challengeId ?? undefined, p_embedding: ev.embedding ?? undefined,
        p_liveness: ev.liveness ?? undefined, p_user_agent: navigator.userAgent,
      };
      const { data, error } =
        kind === "in" ? await supabase.rpc("clock_in", { p_site: site, ...common }) : await supabase.rpc("clock_out", { p_org: orgId, ...common });
      if (error) throw new Error(error.message);
      const r = data as { ok: boolean; flagged?: boolean; reason?: string | null };
      setStep({
        kind: "done",
        ok: r.ok,
        message: !r.ok
          ? `Not recorded: ${r.reason}.`
          : r.flagged
            ? `Recorded, and flagged for your manager to review: ${r.reason}.`
            : kind === "in" ? "Timed in." : "Timed out.",
      });
      router.refresh();
    } catch (e) {
      stopCamera(stream.current);
      setStep({ kind: "done", ok: false, message: e instanceof Error ? e.message : "Something went wrong." });
    }
  }

  async function toggleBreak() {
    setStep({ kind: "busy", message: "Saving…" });
    const { error } = await supabase.rpc(openEntry?.status === "on_break" ? "end_break" : "start_break", { p_org: orgId });
    setStep(error ? { kind: "done", ok: false, message: error.message } : { kind: "idle" });
    router.refresh();
  }

  const busy = step.kind === "busy" || step.kind === "camera";
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-4xl font-semibold tabular-nums tracking-tight">
            {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="mt-1 text-sm text-muted">
            {openEntry
              ? openEntry.status === "on_break"
                ? "On a break"
                : `Working for ${formatDuration(elapsed)}`
              : "Not timed in"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!openEntry && sites.length > 1 && (
            <select value={site} onChange={(e) => setSite(e.target.value)} className="field w-auto" aria-label="Site">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {!openEntry && (
            <button className="btn-primary px-6" disabled={busy || !site} onClick={() => punch("in")}>
              Time in
            </button>
          )}
          {openEntry && checks.breaks && (
            <button className="btn-quiet" disabled={busy} onClick={toggleBreak}>
              {openEntry.status === "on_break" ? "Continue" : "Break"}
            </button>
          )}
          {openEntry && (
            <button className="btn-primary px-6" disabled={busy || openEntry.status === "on_break"} onClick={() => punch("out")}>
              Time out
            </button>
          )}
        </div>
      </div>
      {sites.length === 0 && !openEntry && <p className="mt-3 text-sm text-warn">You aren&apos;t assigned to a site yet. Ask your manager.</p>}

      <div className={step.kind === "camera" ? "mt-4" : "hidden"}>
        <div className="relative mx-auto aspect-[4/3] max-w-sm overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          <p className="absolute inset-x-0 bottom-0 bg-black/60 p-3 text-center text-sm font-medium text-white" aria-live="polite">
            {step.kind === "camera" ? step.message : ""}
          </p>
        </div>
        <p className="mt-2 text-center text-xs text-muted">Only numbers describing your face are sent, never a photo.</p>
      </div>
      {step.kind === "busy" && <p className="mt-3 text-sm text-muted" aria-live="polite">{step.message}</p>}
      {step.kind === "done" && (
        <p className={`mt-3 text-sm ${step.ok ? "text-good" : "text-bad"}`} role="status">{step.message}</p>
      )}
      {(checks.geofence || checks.face) && step.kind === "idle" && (
        <p className="mt-3 text-xs text-muted">
          Time in and out check {[checks.geofence && "your location at the site", checks.face && (checks.liveness ? "your face, with a quick liveness check" : "your face")].filter(Boolean).join(" and ")}.
          {checks.face && ` You'll be asked to ${Object.values(ACTION_PROMPTS).slice(0, 2).map((p) => p.toLowerCase()).join(" or ")}, for example.`}
        </p>
      )}
    </div>
  );
}
