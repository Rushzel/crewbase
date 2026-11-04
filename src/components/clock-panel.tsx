"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { bestPosition, type Reading } from "@/lib/location";
import { FaceCapture, type FaceResult } from "@/components/face-capture";
import { formatDuration } from "@/lib/format";

type Props = {
  orgId: string;
  sites: { id: string; name: string }[];
  openEntry: { id: string; status: string; clock_in: string; break_started?: string | null } | null;
  checks: { geofence: boolean; face: boolean; liveness: boolean; breaks: boolean };
  serverNow: string;
};

type Step = { kind: "idle" } | { kind: "busy"; message: string } | { kind: "done"; ok: boolean; message: string };

export function ClockPanel({ orgId, sites, openEntry, checks, serverNow }: Props) {
  const router = useRouter();
  const supabase = createClient();
  // While set, the face check is on screen; it resolves with the server's result, or null if cancelled.
  const [capture, setCapture] = useState<((r: FaceResult | null) => void) | null>(null);
  const [site, setSite] = useState(sites[0]?.id ?? "");
  const [step, setStep] = useState<Step>({ kind: "idle" });
  // Clock display: starts from the server's time and ticks locally. Recorded times always come from the database.
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    const offset = new Date(serverNow).getTime() - Date.now();
    const t = setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
    return () => clearInterval(t);
  }, [serverNow]);

  const elapsed = openEntry ? (now.getTime() - new Date(openEntry.clock_in).getTime()) / 60000 : 0;

  async function gatherEvidence() {
    let reading: Reading | null = null;
    if (checks.geofence) {
      setStep({ kind: "busy", message: "Finding your location…" });
      reading = await bestPosition();
    }
    let challengeId: string | null = null;
    if (checks.face) {
      // The server checks the face and records its verdict; even a failed check goes on to the database,
      // which refuses the punch and keeps the attempt as evidence.
      const result = await new Promise<FaceResult | null>((resolve) => setCapture(() => resolve));
      setCapture(null);
      if (!result) throw new Error("Face check cancelled.");
      challengeId = result.challenge;
    }
    return { reading, challengeId };
  }

  async function punch(kind: "in" | "out") {
    try {
      const ev = await gatherEvidence();
      setStep({ kind: "busy", message: kind === "in" ? "Timing in…" : "Timing out…" });
      const common = {
        p_lat: ev.reading?.lat, p_lng: ev.reading?.lng, p_accuracy_m: ev.reading?.accuracy, p_age_s: ev.reading?.ageSeconds,
        p_challenge: ev.challengeId ?? undefined, p_user_agent: navigator.userAgent,
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
      setStep({ kind: "done", ok: false, message: e instanceof Error ? e.message : "Something went wrong." });
    }
  }

  async function toggleBreak() {
    setStep({ kind: "busy", message: "Saving…" });
    const { error } = await supabase.rpc(openEntry?.status === "on_break" ? "end_break" : "start_break", { p_org: orgId });
    setStep(error ? { kind: "done", ok: false, message: error.message } : { kind: "idle" });
    router.refresh();
  }

  const busy = step.kind === "busy" || capture !== null;
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

      {capture && (
        <FaceCapture orgId={orgId} purpose="clock" onDone={(r) => capture(r)} onCancel={() => capture(null)} />
      )}
      {step.kind === "busy" && <p className="mt-3 text-sm text-muted" aria-live="polite">{step.message}</p>}
      {step.kind === "done" && (
        <p className={`mt-3 text-sm ${step.ok ? "text-good" : "text-bad"}`} role="status">{step.message}</p>
      )}
      {(checks.geofence || checks.face) && step.kind === "idle" && (
        <p className="mt-3 text-xs text-muted">
          Time in and out check {[checks.geofence && "your location at the site", checks.face && "your face"].filter(Boolean).join(" and ")}.
          {checks.face && " You'll blink once, then the screen changes colour for a few seconds while you keep still."}
        </p>
      )}
    </div>
  );
}
