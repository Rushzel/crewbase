import Link from "next/link";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { submitRequest, editEntry, deleteEntry } from "@/app/(app)/actions";
import { PageHeader, Pill, STATUS_TONE, statusLabel, Empty } from "@/components/ui";
import { formatDate, formatDuration, formatTime, todayIn } from "@/lib/format";

export const metadata = { title: "History" };

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const ctx = await getContext();
  const { supabase, me, settings, can, has, sites } = ctx;
  const tz = settings.timezone;
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayIn(tz).slice(0, 7);
  const memberId = typeof sp.member === "string" ? sp.member : me.id;
  const isSelf = memberId === me.id;

  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

  const [{ data: entries }, { data: people }, { data: pending }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, work_date, clock_in, clock_out, status, break_minutes, worked_minutes, flagged, edited, source, site_id")
      .eq("membership_id", memberId)
      .gte("work_date", from)
      .lte("work_date", to)
      .order("clock_in", { ascending: false }),
    ctx.role.scope !== "own" ? supabase.from("memberships").select("id, display_name").eq("org_id", ctx.org.id).neq("status", "inactive").order("display_name") : Promise.resolve({ data: [] }),
    supabase.from("correction_requests").select("entry_id").eq("membership_id", memberId).eq("status", "pending"),
  ]);
  const pendingFor = new Set((pending ?? []).map((p) => p.entry_id));
  const total = (entries ?? []).reduce((s, e) => s + e.worked_minutes, 0);
  const canEdit = can("time.edit") && !isSelf;
  const person = isSelf ? me.display_name : people?.find((p) => p.id === memberId)?.display_name ?? "This person";
  const q = (o: Record<string, string>) => `?${new URLSearchParams({ month, ...(isSelf ? {} : { member: memberId }), ...o })}`;

  return (
    <>
      <PageHeader title="History" subtitle={`${person} · ${formatDuration(total)} in ${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`}>
        <div className="flex items-center gap-2">
          {people && people.length > 0 && (
            <form className="flex gap-2">
              <input type="hidden" name="month" value={month} />
              <select name="member" defaultValue={memberId} className="field w-auto" aria-label="Person">
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
              <button className="btn-quiet">View</button>
            </form>
          )}
          <Link href={q({ month: prev })} className="btn-quiet" aria-label="Previous month">‹</Link>
          <Link href={q({ month: next })} className="btn-quiet" aria-label="Next month">›</Link>
        </div>
      </PageHeader>

      {isSelf && has("corrections") && (
        <details className="card mb-4">
          <summary className="cursor-pointer text-sm font-medium">Report a missing day</summary>
          <Form action={submitRequest} className="mt-4 grid gap-3 sm:grid-cols-6">
            <input type="hidden" name="kind" value="missing_entry" />
            <div className="sm:col-span-2"><label className="label">Date</label><input type="date" name="date" className="field" required max={todayIn(tz)} /></div>
            <div><label className="label">Time in</label><input type="time" name="timeIn" className="field" required /></div>
            <div><label className="label">Time out</label><input type="time" name="timeOut" className="field" required /></div>
            <div><label className="label">Break (min)</label><input type="number" name="breakMinutes" className="field" defaultValue={60} min={0} /></div>
            <div><label className="label">Site</label><select name="site" className="field">{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="sm:col-span-4"><label className="label">Reason</label><input name="reason" className="field" required minLength={5} /></div>
            <div className="sm:col-span-2"><label className="label">Evidence link (optional)</label><input name="evidence" type="url" className="field" /></div>
            <button className="btn-primary sm:col-span-6 sm:justify-self-start">Send request</button>
          </Form>
        </details>
      )}

      <div className="card">
        {(entries ?? []).length === 0 ? (
          <Empty>No entries this month.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {(entries ?? []).map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{formatDate(e.work_date)}</p>
                    <p className="text-sm tabular-nums text-muted">
                      {formatTime(e.clock_in, tz)} – {e.status === "missing_out" ? "no time out" : e.clock_out ? formatTime(e.clock_out, tz) : "now"} · break {formatDuration(e.break_minutes)}
                      {e.site_id && ` · ${sites.find((s) => s.id === e.site_id)?.name ?? ""}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.flagged && <Pill tone="warn">Flagged</Pill>}
                    {e.edited && <Pill tone="info">{e.source === "manual" ? "Added" : "Corrected"}</Pill>}
                    {pendingFor.has(e.id) && <Pill tone="warn">Correction requested</Pill>}
                    <Pill tone={STATUS_TONE[e.status]}>{statusLabel(e.status)}</Pill>
                    <span className="w-16 text-right text-sm font-medium tabular-nums">{formatDuration(e.worked_minutes)}</span>
                  </div>
                </div>

                {isSelf && has("corrections") && e.clock_out !== null && !pendingFor.has(e.id) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-brand">Request a correction</summary>
                    <Form action={submitRequest} className="mt-3 grid gap-3 rounded-xl bg-canvas p-3 sm:grid-cols-6">
                      <input type="hidden" name="entry" value={e.id} />
                      <input type="hidden" name="date" value={e.work_date} />
                      <div className="sm:col-span-2"><label className="label">What</label>
                        <select name="kind" className="field" defaultValue={e.status === "missing_out" ? "missing_time_out" : "change_times"}>
                          <option value="change_times">Fix times</option>
                          {e.status === "missing_out" && <option value="missing_time_out">Add my time out</option>}
                          <option value="delete_entry">Delete this entry</option>
                        </select>
                      </div>
                      <div><label className="label">Time in</label><input type="time" name="timeIn" className="field" defaultValue={formatTime(e.clock_in, tz)} /></div>
                      <div><label className="label">Time out</label><input type="time" name="timeOut" className="field" defaultValue={e.status === "missing_out" ? "" : formatTime(e.clock_out, tz)} /></div>
                      <div><label className="label">Break (min)</label><input type="number" name="breakMinutes" className="field" defaultValue={e.break_minutes} min={0} /></div>
                      <div className="sm:col-span-6"><label className="label">Reason</label><input name="reason" className="field" required minLength={5} /></div>
                      <button className="btn-primary sm:col-span-6 sm:justify-self-start">Send request</button>
                    </Form>
                  </details>
                )}

                {canEdit && e.clock_out !== null && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-brand">Edit or delete (logged with your reason)</summary>
                    <div className="mt-3 space-y-3 rounded-xl bg-canvas p-3">
                      <Form action={editEntry} className="grid gap-3 sm:grid-cols-6">
                        <input type="hidden" name="entry" value={e.id} />
                        <input type="hidden" name="date" value={e.work_date} />
                        <div><label className="label">Time in</label><input type="time" name="timeIn" className="field" defaultValue={formatTime(e.clock_in, tz)} required /></div>
                        <div><label className="label">Time out</label><input type="time" name="timeOut" className="field" defaultValue={e.status === "missing_out" ? "" : formatTime(e.clock_out, tz)} required /></div>
                        <div><label className="label">Break (min)</label><input type="number" name="breakMinutes" className="field" defaultValue={e.break_minutes} min={0} /></div>
                        <div className="sm:col-span-3"><label className="label">Reason</label><input name="reason" className="field" required /></div>
                        <button className="btn-primary sm:col-span-6 sm:justify-self-start">Save changes</button>
                      </Form>
                      <Form action={deleteEntry} className="flex flex-wrap items-end gap-3">
                        <input type="hidden" name="entry" value={e.id} />
                        <div className="flex-1"><label className="label">Reason for deleting</label><input name="reason" className="field" required /></div>
                        <button className="btn-danger">Delete entry</button>
                      </Form>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
