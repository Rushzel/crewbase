import Link from "next/link";
import { getContext } from "@/lib/context";
import { ClockPanel } from "@/components/clock-panel";
import { PageHeader, Pill, Stat, STATUS_TONE, statusLabel, Empty } from "@/components/ui";
import { addDays, formatDate, formatDuration, formatTime, todayIn } from "@/lib/format";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const { supabase, me, org, settings, has } = await getContext();
  const tz = settings.timezone;
  const today = todayIn(tz);
  const weekStart = addDays(today, -6);
  const monthStart = `${today.slice(0, 8)}01`;

  const [{ data: entries }, { data: assigned }, { data: face }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, work_date, clock_in, clock_out, status, break_minutes, worked_minutes, flagged, edited, source, breaks(break_start, break_end)")
      .eq("membership_id", me.id)
      .gte("work_date", monthStart < weekStart ? monthStart : weekStart)
      .order("clock_in", { ascending: false }),
    supabase.from("member_sites").select("sites(id, name, active)").eq("membership_id", me.id),
    has("face_verification") ? supabase.rpc("face_status", { p_member: me.id }) : Promise.resolve({ data: null }),
  ]);

  const all = entries ?? [];
  const open = all.find((e) => e.clock_out === null) ?? null;
  const sum = (from: string) => all.filter((e) => e.work_date >= from && e.work_date <= today).reduce((s, e) => s + e.worked_minutes, 0);
  const sites = (assigned ?? []).map((a) => a.sites).filter((s): s is NonNullable<typeof s> => !!s && s.active);
  const enrolled = Array.isArray(face) ? face[0]?.enrolled : true;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const perDay = days.map((d) => {
    const es = all.filter((e) => e.work_date === d);
    return { day: d, worked: es.reduce((s, e) => s + e.worked_minutes, 0), brk: es.reduce((s, e) => s + e.break_minutes, 0) };
  });
  const maxDay = Math.max(600, ...perDay.map((d) => d.worked + d.brk));
  const missing = all.filter((e) => e.status === "missing_out");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={`${greeting}, ${me.display_name.split(" ")[0]}`} subtitle={`${formatDate(today)} · ${org.name}`} />
      {has("face_verification") && !enrolled && (
        <div className="card mb-4 border-brand/40 bg-brand/5 text-sm">
          Face check is on for this business. <Link href="/face" className="font-medium text-brand">Enroll your face</Link> before you time in.
        </div>
      )}
      {missing.length > 0 && (
        <div className="card mb-4 border-amber-200 bg-amber-50 text-sm">
          {missing.length} day{missing.length > 1 ? "s have" : " has"} no time out and count 0 hours.{" "}
          <Link href="/history" className="font-medium text-warn">Request a correction</Link>
        </div>
      )}
      <ClockPanel
        orgId={org.id}
        sites={sites.map((s) => ({ id: s.id, name: s.name }))}
        openEntry={open ? { id: open.id, status: open.status, clock_in: open.clock_in } : null}
        checks={{ geofence: has("geofence"), face: has("face_verification"), liveness: settings.liveness_required, breaks: has("breaks") }}
        serverNow={new Date().toISOString()}
      />

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Today" value={formatDuration(sum(today))} />
        <Stat label="Last 7 days" value={formatDuration(sum(weekStart))} />
        <Stat label="This month" value={formatDuration(sum(monthStart))} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Last 7 days</h2>
          <div className="flex h-48 items-end gap-3" role="img" aria-label="Worked time and breaks per day for the last 7 days">
            {perDay.map((d) => (
              <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${formatDate(d.day)}: worked ${formatDuration(d.worked)}, breaks ${formatDuration(d.brk)}`}>
                <div className="w-full max-w-12 rounded-t-md bg-brand/25" style={{ height: `${(d.brk / maxDay) * 100}%` }} />
                <div className="w-full max-w-12 rounded-b-md bg-brand" style={{ height: `${(d.worked / maxDay) * 100}%`, minHeight: d.worked ? 2 : 0 }} />
                <span className="text-xs text-muted">{new Date(`${d.day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand" />Worked <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-sm bg-brand/25" />Breaks</p>
        </div>
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Today&apos;s entries</h2>
          {all.filter((e) => e.work_date === today).length === 0 ? (
            <Empty>Nothing yet today.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {all.filter((e) => e.work_date === today).map((e) => (
                <li key={e.id} className="py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="tabular-nums">{formatTime(e.clock_in, tz)} – {e.clock_out ? formatTime(e.clock_out, tz) : "now"}</span>
                    <Pill tone={STATUS_TONE[e.status]}>{statusLabel(e.status)}</Pill>
                  </div>
                  <div className="mt-0.5 flex justify-between text-xs text-muted">
                    <span>Break {formatDuration(e.break_minutes)}</span>
                    <span>{e.clock_out ? `Worked ${formatDuration(e.worked_minutes)}` : ""}{e.flagged ? " · flagged" : ""}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
