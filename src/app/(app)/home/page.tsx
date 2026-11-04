import Link from "next/link";
import { getContext } from "@/lib/context";
import { PageHeader, Pill, STATUS_TONE, statusLabel } from "@/components/ui";
import { addDays, formatDate, formatDuration, formatMoney, formatPercent, formatTime, todayIn } from "@/lib/format";

export const metadata = { title: "Home" };

function Panel({ title, href, link, children }: { title: string; href?: string; link?: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {href && <Link href={href} className="text-sm text-brand">{link ?? "Open"}</Link>}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function Big({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

// One home screen for every role. Panels appear by permission and feature, not by role name,
// because businesses rename their roles.
export default async function HomePage() {
  const { supabase, org, me, settings, role, can, has } = await getContext();
  const tz = settings.timezone;
  const today = todayIn(tz);
  const monthStart = `${today.slice(0, 7)}-01`;
  const team = role.scope !== "own";
  const clocks = has("time_tracking") && can("time.clock");
  const sells = has("sales") && can("sales.log");
  const managesPeople = can("people.manage") || can("sites.manage");

  const [mine, teamToday, month, corrections, leaves, sales, myLeave, sites, assignments, members, balances] = await Promise.all([
    clocks ? supabase.from("time_entries").select("clock_in, clock_out, status, worked_minutes").eq("membership_id", me.id).eq("work_date", today).order("clock_in") : null,
    team && has("time_tracking") ? supabase.rpc("attendance_days", { p_org: org.id, p_from: today, p_to: today }) : null,
    team && has("time_tracking") && role.scope === "all" ? supabase.rpc("attendance_days", { p_org: org.id, p_from: monthStart, p_to: today }) : null,
    has("corrections") && can("requests.review") ? supabase.from("correction_requests").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending").neq("membership_id", me.id) : null,
    has("leave") && can("leave.review") ? supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending").neq("membership_id", me.id) : null,
    has("sales") && (sells || team) ? supabase.from("customer_applications").select("membership_id, status, price_minor, incentive_minor, decided_at, memberships!customer_applications_membership_id_org_id_fkey(display_name)").eq("org_id", org.id).gte("created_at", addDays(today, -62)) : null,
    has("leave") ? supabase.from("leave_requests").select("starts_on, ends_on, status, leave_types(name)").eq("membership_id", me.id).in("status", ["pending", "approved"]).gte("ends_on", today).order("starts_on").limit(3) : null,
    managesPeople ? supabase.from("sites").select("id, name").eq("org_id", org.id).eq("active", true) : null,
    managesPeople || clocks ? supabase.from("member_sites").select("membership_id, site_id, is_leader, sites(name)").eq("org_id", org.id) : null,
    managesPeople || (role.scope === "all" && can("analytics.view")) ? supabase.from("memberships").select("id, display_name, employment_type, hired_on, roles(name, is_owner, role_permissions(permission))").eq("org_id", org.id).eq("status", "active") : null,
    has("leave") ? supabase.rpc("leave_balances", { p_member: me.id }) : null,
  ]);

  // My day.
  const entries = mine?.data ?? [];
  const open = entries.find((e) => e.clock_out === null);
  const workedToday = entries.reduce((s, e) => s + e.worked_minutes, 0);
  const myAreas = (assignments?.data ?? []).filter((a) => a.membership_id === me.id);

  // Team today.
  const days = teamToday?.data ?? [];
  const tally = (rows: { status: string }[], s: string) => rows.filter((r) => r.status === s).length;
  const notIn = days.filter((d) => d.status === "not_yet" || d.status === "absent");

  // This month across the business: attendance and punctuality on expected days that have passed.
  const past = (month?.data ?? []).filter((d) => d.expected && d.status !== "not_yet" && d.status !== "on_leave");
  const attended = past.filter((d) => ["present", "late", "half_day"].includes(d.status)).length;
  const onTime = tally(past, "present");

  // Sales this month.
  const apps = sales?.data ?? [];
  const thisMonth = (a: { decided_at: string | null }) => a.decided_at != null && todayIn(tz, new Date(a.decided_at)) >= monthStart;
  const myApps = apps.filter((a) => a.membership_id === me.id);
  const approvedMine = myApps.filter((a) => a.status === "approved" && thisMonth(a));
  const ranking = [...apps.filter((a) => a.status === "approved" && thisMonth(a)).reduce((m, a) => {
    const r = m.get(a.membership_id) ?? { name: a.memberships?.display_name ?? "", n: 0 };
    r.n += 1;
    return m.set(a.membership_id, r);
  }, new Map<string, { name: string; n: number }>()).values()].sort((a, b) => b.n - a.n).slice(0, 5);

  // Assignment and probation.
  const people = members?.data ?? [];
  const workers = people.filter((m) => !m.roles?.is_owner && m.roles?.role_permissions.some((p) => p.permission === "time.clock"));
  const assigned = new Set((assignments?.data ?? []).map((a) => a.membership_id));
  const unassigned = workers.filter((w) => !assigned.has(w.id));
  const leaderless = (sites?.data ?? []).filter((s) => !(assignments?.data ?? []).some((a) => a.site_id === s.id && a.is_leader));
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 30);
  const probation = people
    .filter((m) => m.employment_type === "provisional" && m.hired_on)
    .map((m) => {
      const end = new Date(`${m.hired_on}T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + settings.probation_months);
      return { name: m.display_name, end: end.toISOString().slice(0, 10) };
    })
    .filter((p) => new Date(`${p.end}T00:00:00Z`) <= soon)
    .sort((a, b) => a.end.localeCompare(b.end));
  const byRole = [...people.reduce((m, p) => m.set(p.roles?.name ?? "", (m.get(p.roles?.name ?? "") ?? 0) + 1), new Map<string, number>())];

  const waiting = (corrections?.count ?? 0) + (leaves?.count ?? 0) + tally(apps, "for_approval") * (can("sales.review") ? 1 : 0);
  const firstName = me.display_name.split(" ")[0];
  const label = settings.area_label.toLowerCase();

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} subtitle={`${formatDate(today)} · ${role.name} at ${org.name}`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {clocks && (
          <Panel title="My day" href="/today" link={open ? "Time out" : "Time in"}>
            <div className="flex items-center justify-between">
              <Big value={formatDuration(workedToday)} label={open ? `Working since ${formatTime(open.clock_in, tz)}` : entries.length ? "Worked today" : "Not timed in yet"} />
              {open && <Pill tone={open.status === "on_break" ? "warn" : "good"}>{open.status === "on_break" ? "On break" : "Working"}</Pill>}
            </div>
            <p className="mt-3 text-xs text-muted">
              {myAreas.length ? `${settings.area_label}: ${myAreas.map((a) => a.sites?.name).join(", ")}` : `You're not in a ${label} yet, so you can't time in.`}
              {settings.earliest_clock_in && ` · Time in opens at ${settings.earliest_clock_in.slice(0, 5)}`}
            </p>
          </Panel>
        )}

        {has("leave") && (
          <Panel title="My leave" href="/leave" link="Request">
            <ul className="space-y-1 text-sm">
              {(balances?.data ?? []).filter((b) => b.yearly_days != null).map((b) => (
                <li key={b.leave_type_id} className="flex justify-between"><span>{b.name}</span><span className="tabular-nums text-muted">{b.remaining} of {b.yearly_days} left</span></li>
              ))}
            </ul>
            {(myLeave?.data ?? []).map((l, i) => (
              <p key={i} className="mt-2 text-sm">
                <Pill tone={STATUS_TONE[l.status]}>{statusLabel(l.status)}</Pill> {l.leave_types?.name}, {formatDate(l.starts_on)}{l.ends_on !== l.starts_on ? ` to ${formatDate(l.ends_on)}` : ""}
              </p>
            ))}
          </Panel>
        )}

        {sells && (
          <Panel title="My sales this month" href="/sales" link="Log a sale">
            <div className="grid grid-cols-3 gap-2">
              <Big value={approvedMine.length} label="Approved" />
              <Big value={myApps.filter((a) => a.status === "awaiting_verification" || a.status === "follow_up").length} label="Waiting for customer" />
              <Big value={myApps.filter((a) => a.status === "for_approval").length} label="Ready for approval" />
            </div>
            <p className="mt-3 text-sm">Incentives: <span className="font-medium">{formatMoney(approvedMine.reduce((s, a) => s + Number(a.incentive_minor), 0), settings.currency)}</span></p>
          </Panel>
        )}

        {teamToday && (
          <Panel title="Team today" href="/team">
            <div className="grid grid-cols-4 gap-2">
              <Big value={tally(days, "present")} label="Present" />
              <Big value={tally(days, "late")} label="Late" />
              <Big value={tally(days, "absent")} label="Absent" />
              <Big value={tally(days, "on_leave")} label="On leave" />
            </div>
            {notIn.length > 0 && (
              <p className="mt-3 text-xs text-muted">Not in yet: {notIn.slice(0, 6).map((d) => d.display_name).join(", ")}{notIn.length > 6 ? ` and ${notIn.length - 6} more` : ""}</p>
            )}
          </Panel>
        )}

        {waiting > 0 && (
          <Panel title="Waiting for you">
            <ul className="space-y-2 text-sm">
              {(corrections?.count ?? 0) > 0 && <li><Link href="/requests" className="text-brand">{corrections!.count} correction request{corrections!.count === 1 ? "" : "s"}</Link></li>}
              {(leaves?.count ?? 0) > 0 && <li><Link href="/leave" className="text-brand">{leaves!.count} leave request{leaves!.count === 1 ? "" : "s"}</Link></li>}
              {can("sales.review") && tally(apps, "for_approval") > 0 && <li><Link href="/sales?status=for_approval" className="text-brand">{tally(apps, "for_approval")} sale{tally(apps, "for_approval") === 1 ? "" : "s"} ready for approval</Link></li>}
            </ul>
          </Panel>
        )}

        {team && has("sales") && ranking.length > 0 && (
          <Panel title="Top sellers this month" href="/sales">
            <ol className="space-y-1.5 text-sm">
              {ranking.map((r, i) => (
                <li key={r.name} className="flex justify-between"><span><span className="inline-block w-5 text-muted">{i + 1}.</span>{r.name}</span><span className="tabular-nums text-muted">{r.n}</span></li>
              ))}
            </ol>
          </Panel>
        )}

        {month && past.length > 0 && (
          <Panel title="This month" href="/analytics" link="Analytics">
            <div className="grid grid-cols-2 gap-2">
              <Big value={formatPercent(attended / past.length)} label="Attendance on expected days" />
              <Big value={formatPercent(attended ? onTime / attended : null)} label="On time, of days attended" />
            </div>
            <p className="mt-3 text-xs text-muted">From {past.length} expected working days so far. Leave isn&apos;t counted against anyone.</p>
          </Panel>
        )}

        {managesPeople && (unassigned.length > 0 || leaderless.length > 0) && (
          <Panel title={`${settings.area_label_plural} and teams`} href="/areas">
            {unassigned.length > 0 && <p className="text-sm"><span className="font-medium">{unassigned.length}</span> {unassigned.length === 1 ? "person isn't" : "people aren't"} in any {label}: {unassigned.map((u) => u.display_name).join(", ")}.</p>}
            {leaderless.length > 0 && <p className="mt-2 text-sm"><span className="font-medium">{leaderless.length}</span> {leaderless.length === 1 ? `${label} has` : `${settings.area_label_plural.toLowerCase()} have`} no leader: {leaderless.map((s) => s.name).join(", ")}.</p>}
          </Panel>
        )}

        {can("people.manage") && probation.length > 0 && (
          <Panel title="Probation ending" href="/settings/people">
            <ul className="space-y-1 text-sm">
              {probation.map((p) => <li key={p.name} className="flex justify-between"><span>{p.name}</span><span className="text-muted">{formatDate(p.end)}</span></li>)}
            </ul>
            <p className="mt-2 text-xs text-muted">They become regular automatically on that day.</p>
          </Panel>
        )}

        {role.scope === "all" && can("analytics.view") && byRole.length > 0 && (
          <Panel title="People">
            <ul className="space-y-1 text-sm">
              {byRole.sort((a, b) => b[1] - a[1]).map(([r, n]) => <li key={r} className="flex justify-between"><span>{r}</span><span className="tabular-nums text-muted">{n}</span></li>)}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
