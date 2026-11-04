import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { Empty, PageHeader, Pill, STATUS_TONE, statusLabel } from "@/components/ui";
import { requestLeave, reviewLeave, withdrawLeave } from "@/app/(app)/leave/actions";
import { formatDate, todayIn } from "@/lib/format";

export const metadata = { title: "Leave" };

const range = (a: string, b: string) => (a === b ? formatDate(a) : `${formatDate(a)} to ${formatDate(b)}`);

export default async function LeavePage() {
  const { supabase, org, me, settings, can, has } = await getContext();
  if (!has("leave")) redirect("/home");
  const today = todayIn(settings.timezone);
  const reviewer = can("leave.review");

  const [{ data: balances }, { data: types }, { data: requests }] = await Promise.all([
    supabase.rpc("leave_balances", { p_member: me.id }),
    supabase.from("leave_types").select("id, name, paid, yearly_days, needs_attachment").eq("org_id", org.id).eq("active", true).order("name"),
    supabase.from("leave_requests")
      .select("id, membership_id, starts_on, ends_on, days, reason, attachment_path, status, review_note, reviewed_at, created_at, leave_types(name, paid), memberships!leave_requests_membership_id_org_id_fkey(display_name)")
      .eq("org_id", org.id).order("starts_on", { ascending: false }).limit(300),
  ]);

  const mine = (requests ?? []).filter((r) => r.membership_id === me.id);
  const toReview = reviewer ? (requests ?? []).filter((r) => r.status === "pending" && r.membership_id !== me.id).reverse() : [];
  const upcoming = (requests ?? []).filter((r) => r.status === "approved" && r.ends_on >= today && r.membership_id !== me.id).reverse();

  // Short-lived links to attachments, only for requests the viewer can already see.
  const paths = toReview.map((r) => r.attachment_path).filter((p): p is string => Boolean(p));
  const { data: signed } = paths.length ? await supabase.storage.from("leave-attachments").createSignedUrls(paths, 600) : { data: [] };
  const linkFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <>
      <PageHeader title="Leave" subtitle="Requests go to whoever approves leave for you. Days are counted on working days only." />

      {reviewer && (
        <section className="card mb-4">
          <h2 className="mb-3 font-semibold">To review {toReview.length > 0 && <Pill tone="warn">{toReview.length}</Pill>}</h2>
          {toReview.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <ul className="divide-y divide-line">
              {toReview.map((r) => (
                <li key={r.id} className="grid gap-3 py-3 md:grid-cols-[2fr_3fr]">
                  <div>
                    <p className="font-medium">{r.memberships?.display_name}</p>
                    <p className="text-sm">{r.leave_types?.name} · {range(r.starts_on, r.ends_on)} · {r.days} day{r.days === 1 ? "" : "s"}</p>
                    {r.reason && <p className="text-sm text-muted">&ldquo;{r.reason}&rdquo;</p>}
                    {r.attachment_path && linkFor.get(r.attachment_path) && (
                      <a href={linkFor.get(r.attachment_path)!} target="_blank" rel="noreferrer" className="text-sm text-brand">Open attachment</a>
                    )}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <Form action={reviewLeave.bind(null, r.id, true)} className="flex flex-1 flex-wrap items-start gap-2">
                      <input name="note" placeholder="Note (needed to reject)" className="field min-w-40 flex-1" aria-label="Note" />
                      <button className="btn-primary">Approve</button>
                    </Form>
                    <Form action={reviewLeave.bind(null, r.id, false)} className="flex flex-wrap items-start gap-2">
                      <input name="note" placeholder="Why not?" className="field w-40" aria-label="Reason for rejecting" required />
                      <button className="btn-danger">Reject</button>
                    </Form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          <section className="card">
            <h2 className="mb-2 font-semibold">This year</h2>
            <ul className="space-y-2 text-sm">
              {(balances ?? []).map((b) => (
                <li key={b.leave_type_id} className="flex items-center justify-between">
                  <span>{b.name} {!b.paid && <span className="text-xs text-muted">(unpaid)</span>}</span>
                  <span className="tabular-nums text-muted">
                    {b.yearly_days == null ? `${b.used} used` : `${b.remaining} of ${b.yearly_days} left`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2 className="mb-2 font-semibold">Request leave</h2>
            <Form action={requestLeave}>
              <div>
                <label className="label" htmlFor="type">Type</label>
                <select id="type" name="type" className="field" required>
                  {(types ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.needs_attachment ? " (attachment needed)" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="from">First day</label><input id="from" name="from" type="date" className="field" required /></div>
                <div><label className="label" htmlFor="to">Last day</label><input id="to" name="to" type="date" className="field" required /></div>
              </div>
              <div><label className="label" htmlFor="reason">Reason (optional)</label><input id="reason" name="reason" className="field" maxLength={500} /></div>
              <div>
                <label className="label" htmlFor="attachment">Attachment, such as a medical certificate (JPG, PNG or PDF, up to 5 MB)</label>
                <input id="attachment" name="attachment" type="file" accept="image/jpeg,image/png,application/pdf" className="text-sm" />
              </div>
              <button className="btn-primary">Request</button>
            </Form>
          </section>
        </div>

        <div className="space-y-4">
          <section className="card overflow-x-auto">
            <h2 className="mb-2 font-semibold">My requests</h2>
            {mine.length === 0 ? <Empty>No leave requested yet.</Empty> : (
              <table className="data-table">
                <thead><tr><th>Dates</th><th>Type</th><th>Status</th><th>Note</th><th /></tr></thead>
                <tbody>
                  {mine.map((r) => (
                    <tr key={r.id}>
                      <td>{range(r.starts_on, r.ends_on)}<p className="text-xs text-muted">{r.days} day{r.days === 1 ? "" : "s"}</p></td>
                      <td>{r.leave_types?.name}</td>
                      <td><Pill tone={STATUS_TONE[r.status] ?? "quiet"}>{statusLabel(r.status)}</Pill></td>
                      <td className="text-sm text-muted">{r.review_note ?? ""}</td>
                      <td className="text-right">
                        {(r.status === "pending" || (r.status === "approved" && r.starts_on > today)) && (
                          <form action={withdrawLeave.bind(null, r.id)}><button className="text-sm text-brand">Withdraw</button></form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {upcoming.length > 0 && (
            <section className="card">
              <h2 className="mb-2 font-semibold">Coming up in your team</h2>
              <ul className="divide-y divide-line text-sm">
                {upcoming.map((r) => (
                  <li key={r.id} className="flex justify-between py-2">
                    <span>{r.memberships?.display_name} · {r.leave_types?.name}</span>
                    <span className="text-muted">{range(r.starts_on, r.ends_on)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
