import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Avatar, Empty, PageHeader, Pill, STATUS_TONE, Stat, statusLabel } from "@/components/ui";
import { AreaMap, type MapPoint } from "@/components/area-map";
import { formatDate, formatDuration, formatTime, todayIn } from "@/lib/format";

export const metadata = { title: "Team today" };

// Who is in, late, absent or on leave on a day, with the time-in locations on a map.
// Statuses come from the database's attendance_days, so they follow the business's own rules.
export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const { supabase, org, settings, role } = await getContext();
  if (role.scope === "own") redirect("/home");
  const tz = settings.timezone;
  const q = await searchParams;
  const day = typeof q.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.day) ? q.day : todayIn(tz);
  const area = typeof q.area === "string" ? q.area : "";

  const [{ data: days }, { data: points }, { data: assignments }, { data: shapes }] = await Promise.all([
    supabase.rpc("attendance_days", { p_org: org.id, p_from: day, p_to: day }),
    supabase.rpc("time_in_points", { p_org: org.id, p_day: day }),
    supabase.from("member_sites").select("membership_id, site_id, is_leader, sites(name)").eq("org_id", org.id),
    supabase.rpc("site_geofences", { p_org: org.id }),
  ]);

  const areaOf = new Map<string, string[]>();
  for (const a of assignments ?? []) areaOf.set(a.membership_id, [...(areaOf.get(a.membership_id) ?? []), a.site_id]);
  const siteName = new Map((assignments ?? []).map((a) => [a.site_id, a.sites?.name ?? ""]));
  const rows = (days ?? []).filter((d) => !area || (areaOf.get(d.membership_id) ?? []).includes(area));
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const shown = new Set(rows.map((r) => r.membership_id));
  const nameOf = new Map(rows.map((r) => [r.membership_id, r.display_name]));

  const mapPoints: MapPoint[] = (points ?? [])
    .filter((p) => shown.has(p.membership_id) && p.lat != null && p.lng != null)
    .map((p) => ({
      lat: p.lat!, lng: p.lng!,
      tone: !p.accepted ? "bad" : p.flagged ? "warn" : "good",
      label: `${nameOf.get(p.membership_id)} · ${formatTime(p.server_time, tz)}${p.accepted ? (p.flagged ? " · flagged" : "") : ` · blocked: ${p.reason}`}`,
    }));
  const areas = (shapes ?? [])
    .filter((s) => (s.ring as unknown[] | null)?.length)
    .map((s) => ({ id: s.site_id, name: siteName.get(s.site_id) ?? "", ring: s.ring as [number, number][], highlight: s.site_id === area }));
  const allAreas = [...new Map((assignments ?? []).map((a) => [a.site_id, a.sites?.name ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <>
      <PageHeader title="Team today" subtitle={`${formatDate(day)} · people you can see`}>
        <form className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="day">Day</label>
            <input id="day" name="day" type="date" defaultValue={day} className="field" />
          </div>
          {allAreas.length > 0 && (
            <div>
              <label className="label" htmlFor="area">{settings.area_label}</label>
              <select id="area" name="area" defaultValue={area} className="field">
                <option value="">All</option>
                {allAreas.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          )}
          <button className="btn-quiet">Show</button>
        </form>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Present" value={count("present")} />
        <Stat label="Late" value={count("late")} />
        <Stat label="Absent" value={count("absent") + count("half_day")} note={count("half_day") ? `${count("half_day")} half day` : undefined} />
        <Stat label="On leave" value={count("on_leave")} />
        <Stat label="Not in yet" value={count("not_yet")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section className="card overflow-x-auto">
          {rows.length === 0 ? (
            <Empty>Nobody was expected to work on this day.</Empty>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Person</th><th>Status</th><th>In</th><th>Out</th><th className="text-right">Worked</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.membership_id}>
                    <td>
                      <Link href={`/history?member=${r.membership_id}`} className="flex items-center gap-3 hover:text-brand">
                        <Avatar name={r.display_name} />
                        <span>
                          <span className="block font-medium">{r.display_name}</span>
                          <span className="block text-xs text-muted">
                            {(areaOf.get(r.membership_id) ?? []).map((s) => siteName.get(s)).join(", ") || `No ${settings.area_label.toLowerCase()}`}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Pill tone={STATUS_TONE[r.status] ?? "quiet"}>{statusLabel(r.status)}</Pill>
                      {r.late_minutes > 0 && <span className="ml-2 text-xs text-muted">{formatDuration(r.late_minutes)} late</span>}
                      {r.leave_type && <span className="ml-2 text-xs text-muted">{r.leave_type}</span>}
                    </td>
                    <td className="tabular-nums">{formatTime(r.first_in, tz)}</td>
                    <td className="tabular-nums">{r.working ? <Pill tone="good">Working</Pill> : formatTime(r.last_out, tz)}</td>
                    <td className="text-right tabular-nums">{r.worked_minutes ? formatDuration(r.worked_minutes) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2 className="mb-1 font-semibold">Where people timed in</h2>
          <p className="mb-3 text-xs text-muted">Green: accepted. Amber: accepted but flagged for review. Red: blocked attempt.</p>
          <AreaMap areas={areas} points={mapPoints} height="h-96" />
        </section>
      </div>
      <p className="mt-4 text-xs text-muted">
        Rules: on time until {settings.grace_minutes} minutes after the start, absent if in more than {settings.absent_after_minutes} minutes late
        or under {formatDuration(settings.half_day_minutes)} worked, half day under {formatDuration(settings.full_day_minutes)}.{" "}
        {settings.earliest_clock_in && `Time in opens at ${settings.earliest_clock_in.slice(0, 5)}.`}
      </p>
    </>
  );
}
