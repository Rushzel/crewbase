import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { decideRequest } from "@/app/(app)/actions";
import { PageHeader, Pill, STATUS_TONE, statusLabel, Empty } from "@/components/ui";
import { formatDate, formatDuration, formatTime } from "@/lib/format";

export const metadata = { title: "Requests" };

const KIND = { change_times: "Fix times", missing_time_out: "Missing time out", missing_entry: "Missing day", delete_entry: "Delete entry" } as const;

export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const { supabase, me, settings, can } = await getContext();
  const tz = settings.timezone;
  const show = (await searchParams).show === "all" ? "all" : "pending";
  let query = supabase
    .from("correction_requests")
    .select("id, membership_id, kind, work_date, old_clock_in, old_clock_out, old_break_minutes, requested_in, requested_out, requested_break_minutes, reason, evidence_link, status, review_note, self_approved, created_at, memberships!correction_requests_membership_id_fkey(display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (show === "pending") query = query.eq("status", "pending");
  const { data: requests } = await query;
  const reviewer = can("requests.review");
  const span = (a: string | null, b: string | null, brk: number | null) =>
    a ? `${formatTime(a, tz)} – ${b ? formatTime(b, tz) : "?"}${brk != null ? ` · break ${formatDuration(brk)}` : ""}` : "–";

  return (
    <>
      <PageHeader title="Requests" subtitle={reviewer ? "Corrections waiting for your decision, and your own requests." : "Your correction requests."}>
        <div className="flex gap-2 text-sm">
          <a href="?show=pending" className={show === "pending" ? "btn-primary" : "btn-quiet"}>Pending</a>
          <a href="?show=all" className={show === "all" ? "btn-primary" : "btn-quiet"}>All</a>
        </div>
      </PageHeader>
      <div className="space-y-3">
        {(requests ?? []).length === 0 && <div className="card"><Empty>No {show === "pending" ? "pending " : ""}requests.</Empty></div>}
        {(requests ?? []).map((r) => {
          const mine = r.membership_id === me.id;
          return (
            <div key={r.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{mine ? "You" : r.memberships?.display_name} · {KIND[r.kind]} · {formatDate(r.work_date)}</p>
                  <p className="mt-1 text-sm text-muted">&ldquo;{r.reason}&rdquo;{r.evidence_link && <> · <a className="text-brand" href={r.evidence_link} target="_blank" rel="noreferrer">evidence</a></>}</p>
                </div>
                <div className="flex items-center gap-2">
                  {r.self_approved && <Pill tone="warn">Self-approved</Pill>}
                  <Pill tone={STATUS_TONE[r.status]}>{statusLabel(r.status)}</Pill>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-canvas p-3"><p className="label">Now</p><p className="tabular-nums">{r.kind === "missing_entry" ? "No entry" : span(r.old_clock_in, r.old_clock_out, r.old_break_minutes)}</p></div>
                <div className="rounded-xl bg-brand/5 p-3"><p className="label">Requested</p><p className="tabular-nums">{r.kind === "delete_entry" ? "Delete the entry" : span(r.requested_in, r.requested_out, r.requested_break_minutes)}</p></div>
              </div>
              {r.review_note && <p className="mt-2 text-sm text-muted">Note: {r.review_note}</p>}
              {r.status === "pending" && (reviewer || mine) && (
                <Form action={decideRequest} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="request" value={r.id} />
                  {reviewer && <div className="min-w-48 flex-1"><label className="label">Note (required to reject)</label><input name="note" className="field" /></div>}
                  {reviewer && <button name="decision" value="approve" className="btn-primary">Approve</button>}
                  {reviewer && <button name="decision" value="reject" className="btn-danger">Reject</button>}
                  {mine && <button name="decision" value="withdraw" className="btn-quiet">Withdraw</button>}
                </Form>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
