"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { captureForEnrollment, MODEL_VERSION, startCamera, stopCamera } from "@/lib/face";

const CAPTURES = 5;

// Enrolls the signed-in person, or, for a team leader, someone in their team who is present and agrees.
export function FaceEnroll({ memberId, enrolled, personName }: { memberId: string; enrolled: boolean; personName?: string }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ phase: "idle" | "camera" | "saving" | "done" | "error"; n?: number; message?: string }>({ phase: "idle" });
  useEffect(() => () => stopCamera(stream.current), []);

  async function enroll() {
    try {
      setState({ phase: "camera", n: 0 });
      stream.current = await startCamera(video.current!);
      const embeddings = await captureForEnrollment(video.current!, CAPTURES, (n) => setState({ phase: "camera", n }));
      stopCamera(stream.current);
      setState({ phase: "saving" });
      const { error } = await createClient().rpc("enroll_face", {
        p_member: memberId,
        p_embeddings: embeddings,
        p_model_version: MODEL_VERSION,
        p_consent: consent,
      });
      if (error) throw new Error(error.message);
      setState({ phase: "done", message: personName ? `${personName} is enrolled and can time in now.` : "Enrolled. You can time in now." });
      router.refresh();
    } catch (e) {
      stopCamera(stream.current);
      setState({ phase: "error", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  }

  return (
    <div className="card">
      <h2 className="font-semibold">{personName ? `${enrolled ? "Enroll again" : "Enroll"}: ${personName}` : enrolled ? "Enroll again" : "Enroll your face"}</h2>
      <p className="mt-1 text-sm text-muted">{personName ? `${personName} faces the camera` : "Face the camera"} in good light, moving the head slightly between captures.</p>
      <div className={state.phase === "camera" ? "mt-4" : "hidden"}>
        <div className="relative mx-auto aspect-[4/3] max-w-sm overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          <p className="absolute inset-x-0 bottom-0 bg-black/60 p-3 text-center text-sm text-white" aria-live="polite">
            Capture {state.n ?? 0} of {CAPTURES}
          </p>
        </div>
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>
          {personName
            ? `${personName} is here with me and agrees to their face being enrolled for time in and out checks. They can enroll again or ask for it to be removed.`
            : "I agree to my face being enrolled for time in and out checks with this business. I can enroll again or ask for it to be removed."}
        </span>
      </label>
      <button className="btn-primary mt-4" disabled={!consent || state.phase === "camera" || state.phase === "saving"} onClick={enroll}>
        {state.phase === "saving" ? "Saving…" : "Start camera"}
      </button>
      {state.message && <p className={`mt-3 text-sm ${state.phase === "error" ? "text-bad" : "text-good"}`}>{state.message}</p>}
    </div>
  );
}
