import { getContext } from "@/lib/context";
import { PageHeader, Pill, Stat, Empty } from "@/components/ui";
import { addDays, formatDate, formatDuration, formatPercent, todayIn } from "@/lib/format";
import { flagsFor, median, weekdayForecast } from "@/lib/analytics";

export const metadata = { title: "Analytics" };

// Workforce analytics for the people the viewer may see (enforced by row-level security in the database).
export default async function AnalyticsPage() {
  const { supabase, org, settings, role } = await getContext();
  const today = todayIn(settings.timezone);
  const to = addDays(today, -1);
  const from = addDays(to, -27);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -27);

  const [{ data: now }, { data: before }, { data: daily }] = await Promise.all([
    supabase.rpc("member_metrics", { p_org: org.id, p_from: from, p_to: to }),
    supabase.rpc("member_metrics", { p_org: org.id, p_from: prevFrom, p_to: prevTo }),
    supabase.rpc("daily_totals", { p_org: org.id, p_from: addDays(to, -55), p_to: to }),
  ]);
  const rows = (now ?? []).filter((r) => r.days_worked + r.days_scheduled > 0);
  const prev = new Map((before ?? []).map((r) => [r.membership_id, r]));
  const reliable = rows.filter((r) => r.enough_data);
  const teamMedian = {
    attendance: median(reliable.map((r) => Number(r.attendance_rate))),
    onTime: median(reliable.map((r) => Number(r.on_time_rate))),
    hours: median(reliable.map((r) => Number(r.worked_minutes))),
  };
  const totalWorked = rows.reduce((s, r) => s + Number(r.worked_minutes), 0);
  const prevWorked = (before ?? []).reduce((s, r) => s + Number(r.worked_minutes), 0);
  const trend = prevWorked > 0 ? (totalWorked - prevWorked) / prevWorked : null;
  const forecast = weekdayForecast((daily ?? []).map((d) => ({ day: d.day, worked_minutes: Number(d.worked_minutes) })), today);
  const flagged = rows.map((r) => ({ r, flags: flagsFor({ ...r, attendance_rate: num(r.attendance_rate), on_time_rate: num(r.on_time_rate), overtime_share: num(r.overtime_share), missing_out_rate: num(r.missing_out_rate), verification_failure_rate: num(r.verification_failure_rate) }) })).filter((x) => x.flags.length);
  const delta = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);

  return (
    <>
      <PageHeader title="Analytics" subtitle={`${formatDate(from)} – ${formatDate(to)} (last 4 weeks) against the 4 weeks before · ${role.scope === "all" ? "everyone" : role.scope === "team" ? "your team" : "you"}`} />
      {rows.length === 0 ? (
        <div className="card"><Empty>No time recorded in this period.</Empty></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Hours worked" value={formatDuration(totalWorked)} note={trend == null ? undefined : `${trend >= 0 ? "+" : ""}${formatPercent(trend)} against the previous 4 weeks`} />
            <Stat label="Median attendance" value={formatPercent(teamMedian.attendance)} note="Scheduled days worked" />
            <Stat label="Median on time" value={formatPercent(teamMedian.onTime)} note={`Within ${settings.grace_minutes} minutes of the start`} />
            <Stat label="Needs attention" value={flagged.length} note="People with at least one flag" />
          </div>

          <div className="card mt-4 overflow-x-auto">
            <h2 className="mb-3 text-sm font-semibold">People</h2>
            <table className="data-table">
              <thead>
                <tr><th>Person</th><th>Attendance</th><th>On time</th><th>Median late</th><th>Hours</th><th>vs schedule</th><th>Overtime</th><th>Checks failed</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = prev.get(r.membership_id);
                  const att = delta(num(r.attendance_rate), num(p?.attendance_rate));
                  return (
                    <tr key={r.membership_id}>
                      <td>
                        <span className="font-medium">{r.display_name}</span>
                        {r.employment_type === "provisional" && <span className="ml-2"><Pill>Provisional</Pill></span>}
                      </td>
                      {!r.enough_data ? (
                        <td colSpan={7} className="text-muted">Not enough data ({r.days_worked} day{r.days_worked === 1 ? "" : "s"}; measures need 10)</td>
                      ) : (
                        <>
                          <td className="tabular-nums">
                            {formatPercent(num(r.attendance_rate))}
                            {att != null && Math.abs(att) >= 0.05 && <span className={`ml-1 text-xs ${att > 0 ? "text-good" : "text-bad"}`}>{att > 0 ? "▲" : "▼"}</span>}
                          </td>
                          <td className={`tabular-nums ${cmp(num(r.on_time_rate), teamMedian.onTime)}`}>{formatPercent(num(r.on_time_rate))}</td>
                          <td className="tabular-nums">{r.median_late_minutes != null ? `${r.median_late_minutes} min` : "–"}</td>
                          <td className="tabular-nums">{formatDuration(Number(r.worked_minutes))}</td>
                          <td className="tabular-nums">{formatPercent(num(r.hours_vs_schedule))}</td>
                          <td className="tabular-nums">{formatPercent(num(r.overtime_share))}</td>
                          <td className="tabular-nums">{formatPercent(num(r.verification_failure_rate))}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">Green or red marks a value at least 10 points above or below the median of people with enough data. ▲▼ show a change of 5 points or more from the previous 4 weeks.</p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold">Needs attention</h2>
              {flagged.length === 0 ? <Empty>Nobody crosses a rule this period.</Empty> : (
                <ul className="divide-y divide-line">
                  {flagged.map(({ r, flags }) => (
                    <li key={r.membership_id} className="py-2 text-sm">
                      <p className="font-medium">{r.display_name}</p>
                      {flags.map((f) => <p key={f.rule} className="text-muted">{f.rule}: {f.detail}</p>)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card">
              <h2 className="mb-1 text-sm font-semibold">Hours forecast, next 7 days</h2>
              <p className="mb-3 text-xs text-muted">Average of the same weekday over the last 8 weeks, with the lowest and highest day as the range. A rough guide for staffing, not a promise.</p>
              <table className="data-table">
                <thead><tr><th>Day</th><th>Expected</th><th>Range</th></tr></thead>
                <tbody>
                  {forecast.map((f) => (
                    <tr key={f.day}>
                      <td>{new Date(`${f.day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</td>
                      <td className="tabular-nums">{f.samples ? formatDuration(f.expected) : "–"}</td>
                      <td className="tabular-nums text-muted">{f.samples ? `${formatDuration(f.low)} – ${formatDuration(f.high)}` : "no history"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

const num = (x: number | string | null | undefined) => (x == null ? null : Number(x));
const cmp = (v: number | null, m: number | null) => (v == null || m == null ? "" : v - m >= 0.1 ? "text-good" : m - v >= 0.1 ? "text-bad" : "");
