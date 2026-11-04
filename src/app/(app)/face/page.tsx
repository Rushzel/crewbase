import Link from "next/link";
import { getContext } from "@/lib/context";
import { PageHeader, Pill } from "@/components/ui";
import { FaceEnroll } from "@/components/face-enroll";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Face check" };

export default async function FacePage({ searchParams }: PageProps<"/face">) {
  const { supabase, me, org, can } = await getContext();
  const enrollsOthers = can("face.enroll_others");
  const { data: team } = enrollsOthers ? await supabase.rpc("my_team", { p_org: org.id }) : { data: [] };
  const others = (team ?? []).filter((t) => t.membership_id !== me.id);
  const statuses = await Promise.all(
    [me.id, ...others.map((o) => o.membership_id)].map(async (id) => [id, (await supabase.rpc("face_status", { p_member: id })).data?.[0]] as const),
  );
  const status = new Map(statuses);
  const chosen = (await searchParams).member;
  const target = others.find((o) => o.membership_id === chosen);
  const mine = status.get(me.id);

  return (
    <>
      <PageHeader title="Face check" subtitle="Used with a liveness check when you time in and out, so a photo can't be used instead of you." />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {target ? (
          <div>
            <FaceEnroll key={target.membership_id} orgId={org.id} memberId={target.membership_id} personName={target.display_name} enrolled={Boolean(status.get(target.membership_id)?.enrolled)} />
            <Link href="/face" className="mt-2 inline-block text-sm text-brand">Back to my own</Link>
          </div>
        ) : (
          <FaceEnroll orgId={org.id} memberId={me.id} enrolled={Boolean(mine?.enrolled)} />
        )}
        <div className="space-y-4">
          {enrollsOthers && others.length > 0 && (
            <section className="card">
              <h2 className="font-semibold">Your team</h2>
              <p className="mb-2 text-xs text-muted">Enroll someone in person: they stand in front of your camera and agree first.</p>
              <ul className="divide-y divide-line text-sm">
                {others.map((o) => (
                  <li key={o.membership_id} className="flex items-center justify-between py-2">
                    <span>{o.display_name} <span className="text-xs text-muted">{o.role_name}</span></span>
                    <span className="flex items-center gap-3">
                      {status.get(o.membership_id)?.enrolled ? <Pill tone="good">Enrolled</Pill> : <Pill tone="warn">Not enrolled</Pill>}
                      <Link href={`/face?member=${o.membership_id}`} className="text-brand">Enroll</Link>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="card text-sm">
            <h2 className="font-semibold">What is stored</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li>128 numbers describing the face, made on our server from a few seconds of pictures. No photo is kept.</li>
              <li>Nobody can read those numbers through the app, including owners. Only the database compares against them.</li>
              <li>The consent and the date of enrollment.</li>
              {org.is_demo && <li>In this demo, enrollments are deleted automatically after 24 hours.</li>}
            </ul>
            <h2 className="mt-4 font-semibold">Your status</h2>
            <p className="mt-1 text-muted">{mine?.enrolled ? `Enrolled on ${formatDate(mine.enrolled_at)}.` : "Not enrolled yet."}</p>
            <h2 className="mt-4 font-semibold">How the check works</h2>
            <p className="mt-1 text-muted">
              Your phone only takes the pictures. Our server checks them: the same face in every picture, a blink, no photo or screen
              held up, and your skin reflecting the screen&apos;s colours in the order it chose. Only the server can record a pass.
              It isn&apos;t a certified biometric check, and its limits are still being measured with real cameras.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
