"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FaceCapture } from "@/components/face-capture";

// Enrolls the signed-in person, or, for a leader, someone in their team who is present and agrees.
// The same check as time in: the server must see a live face before it stores anything.
export function FaceEnroll({ orgId, memberId, enrolled, personName }: { orgId: string; memberId: string; enrolled: boolean; personName?: string }) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="card">
      <h2 className="font-semibold">{personName ? `${enrolled ? "Enroll again" : "Enroll"}: ${personName}` : enrolled ? "Enroll again" : "Enroll your face"}</h2>
      <p className="mt-1 text-sm text-muted">
        {personName ? `${personName} faces the camera` : "Face the camera"} in good light, blinks once when asked, and keeps still while the screen
        changes colour. It takes about 10 seconds.
      </p>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>
          {personName
            ? `${personName} is here with me and agrees to their face being enrolled for time in and out checks. They can enroll again or ask for it to be removed.`
            : "I agree to my face being enrolled for time in and out checks with this business. I can enroll again or ask for it to be removed."}
        </span>
      </label>
      <button className="btn-primary mt-4" disabled={!consent} onClick={() => { setResult(null); setOpen(true); }}>
        Start camera
      </button>
      {result && <p className={`mt-3 text-sm ${result.ok ? "text-good" : "text-bad"}`} role="status">{result.message}</p>}
      {open && (
        <FaceCapture
          orgId={orgId}
          purpose="enroll"
          memberId={memberId}
          consent={consent}
          onCancel={() => setOpen(false)}
          onDone={(r) => {
            setOpen(false);
            setResult(r.passed
              ? { ok: true, message: personName ? `${personName} is enrolled and can time in now.` : "Enrolled. You can time in now." }
              : { ok: false, message: `Not enrolled: ${r.reason}.` });
            if (r.passed) router.refresh();
          }}
        />
      )}
    </div>
  );
}
