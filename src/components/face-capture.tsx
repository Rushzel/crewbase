"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// The face check, the way banking apps do it: the face in an oval, a blink, then the screen around
// the oval flashes a colour sequence chosen by the server. This component only captures pictures;
// the server decides the result (src/app/api/face/check).

export type FaceResult = { passed: boolean; reason: string | null; challenge: string };

type Props = {
  orgId: string;
  purpose: "clock" | "enroll";
  memberId?: string;
  consent?: boolean;
  onDone: (result: FaceResult) => void;
  onCancel: () => void;
};

type Meta = { phase: "still" | "blink" | "flash"; step?: number };
type Stage = "starting" | "ready" | "still" | "blink" | "flash" | "checking" | "error";

const STEP_MS = 600; // each colour shows for 0.6 s: under 2 changes a second

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function FaceCapture({ orgId, purpose, memberId, consent, onDone, onCancel }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cancelled = useRef(false);
  const [stage, setStage] = useState<Stage>("starting");
  const [message, setMessage] = useState("Starting the camera…");
  const [flash, setFlash] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ id: string; colors: string[] } | null>(null);

  useEffect(() => {
    cancelled.current = false;
    (async () => {
      try {
        const { data, error } = await createClient().rpc("issue_face_challenge", {
          p_org: orgId, p_purpose: purpose, p_member: memberId, p_consent: consent ?? false,
        });
        if (error || !data) throw new Error(error?.message ?? "Couldn't start the face check.");
        const c = data as { id: string; colors: string[] };
        stream.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled.current) return;
        video.current!.srcObject = stream.current;
        await video.current!.play();
        setChallenge(c);
        setStage("ready");
        setMessage("Fit your face inside the oval, in good light, with the screen's brightness turned up.");
      } catch (e) {
        setStage("error");
        setMessage(e instanceof Error && e.name === "NotAllowedError" ? "Allow the camera to continue." : e instanceof Error ? e.message : "The camera didn't start.");
      }
    })();
    return () => {
      cancelled.current = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [orgId, purpose, memberId, consent]);

  // One picture from the camera, 480 pixels wide, as a JPEG.
  function grab(): Promise<Blob> {
    const v = video.current!;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = Math.round((480 * v.videoHeight) / v.videoWidth) || 360;
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No picture"))), "image/jpeg", 0.85));
  }

  async function run() {
    if (!challenge) return;
    const frames: Blob[] = [];
    const meta: Meta[] = [];
    const take = async (m: Meta) => {
      frames.push(await grab());
      meta.push(m);
    };
    try {
      setStage("still");
      setMessage("Look straight at the camera.");
      await wait(900);
      for (let i = 0; i < 3; i++) { await take({ phase: "still" }); await wait(250); }

      setStage("blink");
      setMessage("Blink once.");
      const blinkEnd = Date.now() + 2200;
      while (Date.now() < blinkEnd) { await take({ phase: "blink" }); await wait(110); }

      setStage("flash");
      setMessage("Keep still while the screen changes colour.");
      for (let step = 0; step < challenge.colors.length; step++) {
        setFlash(challenge.colors[step]);
        // The camera needs a moment to see the new light; capture later in each step.
        await wait(STEP_MS * 0.5);
        await take({ phase: "flash", step });
        await wait(STEP_MS * 0.25);
        await take({ phase: "flash", step });
        await wait(STEP_MS * 0.25);
      }
      setFlash(null);
      stream.current?.getTracks().forEach((t) => t.stop());

      setStage("checking");
      setMessage("Checking…");
      const body = new FormData();
      body.set("challenge", challenge.id);
      body.set("meta", JSON.stringify(meta));
      frames.forEach((f, i) => body.append("frame", f, `${i}.jpg`));
      const res = await fetch("/api/face/check", { method: "POST", body });
      const r = (await res.json()) as FaceResult;
      onDone({ passed: r.passed, reason: r.reason, challenge: challenge.id });
    } catch (e) {
      setFlash(null);
      setStage("error");
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  const capturing = stage === "still" || stage === "blink" || stage === "flash";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Face check"
      className="fixed inset-0 z-50 flex flex-col items-center justify-between px-5 py-8 text-white transition-colors duration-100"
      style={{ background: flash ?? "#121417" }}
    >
      <p className="max-w-sm text-center text-lg font-semibold drop-shadow" aria-live="polite" style={{ color: flash ? "#000" : undefined }}>
        {message}
      </p>

      <div className="relative aspect-[3/4] w-[min(72vw,320px)] overflow-hidden rounded-[50%] border-4 border-white/80 bg-black">
        <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-3">
        {stage === "ready" && (
          <>
            <p className="text-center text-sm text-white/80">
              You&apos;ll blink once, then the screen changes colour 5 times, a little under twice a second. If flashing light
              affects you, cancel and tell your manager instead.
            </p>
            <button className="w-full rounded-full bg-white px-5 py-3 font-semibold text-black" onClick={run}>Start</button>
          </>
        )}
        {stage === "checking" && <p className="text-sm text-white/80">Only a few seconds of pictures are sent, and none are kept.</p>}
        {stage !== "checking" && (
          <button
            className={`text-sm underline ${flash ? "text-black" : "text-white/80"}`}
            onClick={() => { cancelled.current = true; stream.current?.getTracks().forEach((t) => t.stop()); onCancel(); }}
          >
            {capturing ? "Stop" : "Cancel"}
          </button>
        )}
      </div>
    </div>
  );
}
