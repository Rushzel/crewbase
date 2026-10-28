import { getContext } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { FaceEnroll } from "@/components/face-enroll";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Face check" };

export default async function FacePage() {
  const { supabase, me, org } = await getContext();
  const { data } = await supabase.rpc("face_status", { p_member: me.id });
  const status = data?.[0];
  return (
    <>
      <PageHeader title="Face check" subtitle="Used with a liveness check when you time in and out, so a photo can't be used instead of you." />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <FaceEnroll memberId={me.id} enrolled={Boolean(status?.enrolled)} />
        <div className="card text-sm">
          <h2 className="font-semibold">What is stored</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>A list of numbers describing your face, averaged from five captures. No photo is stored.</li>
            <li>Nobody can read those numbers through the app, including owners. Only the database&apos;s time-in check compares against them.</li>
            <li>Your consent and the date you enrolled.</li>
            {org.is_demo && <li>In this demo, your enrollment is deleted automatically after 24 hours.</li>}
          </ul>
          <h2 className="mt-4 font-semibold">Status</h2>
          <p className="mt-1 text-muted">{status?.enrolled ? `Enrolled on ${formatDate(status.enrolled_at)}.` : "Not enrolled yet."}</p>
          <h2 className="mt-4 font-semibold">Limits</h2>
          <p className="mt-1 text-muted">
            The liveness check runs in your browser and stops photos and screens held up to the camera. Because it runs on your
            device, it isn&apos;t a certified biometric check; the server&apos;s one-time challenge and replay check make tampering detectable.
          </p>
        </div>
      </div>
    </>
  );
}
