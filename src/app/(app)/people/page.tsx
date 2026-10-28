import Link from "next/link";
import { getContext } from "@/lib/context";
import { PageHeader, Pill, Stat } from "@/components/ui";
import { formatTime, todayIn } from "@/lib/format";

export const metadata = { title: "People" };

// Live board: who's working, on a break, timed out or not in yet. Shows only people the viewer may see.
export default async function PeoplePage() {
  const { supabase, org, settings } = await getContext();
  const tz = settings.timezone;
  const today = todayIn(tz);
  const [{ data: members }, { data: entries }, { data: events }] = await Promise.all([
    supabase.from("memberships").select("id, display_name, employee_code, roles(name)").eq("org_id", org.id).eq("status", "active").order("display_name"),
    supabase.from("time_entries").select("membership_id, clock_in, clock_out, status, flagged").eq("org_id", org.id).eq("work_date", today).order("clock_in"),
    supabase.from("clock_events").select("membership_id, kind, server_time, accepted, reason").eq("org_id", org.id).gte("server_time", hoursAgo(18)).order("server_time", { ascending: false }),
  ]);

  const tone = { Working: "good", "On break": "warn", "Timed out": "quiet", "Not in yet": "bad" } as const;
  const visible = new Set((entries ?? []).map((e) => e.membership_id));
  const rows = (members ?? []).map((m) => {
    const es = (entries ?? []).filter((e) => e.membership_id === m.id);
    const open = es.find((e) => e.clock_out === null);
    const last = (events ?? []).find((e) => e.membership_id === m.id);
    const state: keyof typeof tone = open ? (open.status === "on_break" ? "On break" : "Working") : es.length ? "Timed out" : "Not in yet";
    const line = !last || !visible.has(m.id) && !open
      ? "No activity today"
      : `${last.accepted ? { in: "Timed in", out: "Timed out", break_start: "On break since", break_end: "Back from break" }[last.kind] : "Blocked attempt"} at ${formatTime(last.server_time, tz)}${!last.accepted && last.reason ? ` (${last.reason})` : ""}`;
    return { m, state, line, flagged: es.some((e) => e.flagged) || (last && !last.accepted) };
  });
  const count = (s: string) => rows.filter((r) => r.state === s).length;

  return (
    <>
      <PageHeader title="People" subtitle="Today, for the people you can see." />
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {(["Working", "On break", "Timed out", "Not in yet"] as const).map((s) => <Stat key={s} label={s} value={count(s)} />)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ m, state, line, flagged }) => (
          <Link key={m.id} href={`/history?member=${m.id}`} className="card block transition hover:border-brand/40">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                  {m.display_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </span>
                <div>
                  <p className="text-sm font-medium">{m.display_name}</p>
                  <p className="text-xs text-muted">{m.roles?.name}</p>
                </div>
              </div>
              <Pill tone={tone[state]}>{state}</Pill>
            </div>
            <p className="mt-3 text-xs text-muted">{line}{flagged ? " · needs review" : ""}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}
