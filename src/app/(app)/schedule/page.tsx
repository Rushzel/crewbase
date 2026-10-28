import Link from "next/link";
import { getContext } from "@/lib/context";
import { PageHeader, Empty } from "@/components/ui";
import { addDays, formatDate, formatTime, todayIn } from "@/lib/format";

export const metadata = { title: "Schedule" };

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const { supabase, org, settings, sites } = await getContext();
  const tz = settings.timezone;
  const sp = await searchParams;
  const today = todayIn(tz);
  const start = typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const { data: shifts } = await supabase
    .from("shifts")
    .select("id, starts_at, ends_at, site_id, membership_id, memberships(display_name)")
    .eq("org_id", org.id)
    .gte("starts_at", `${addDays(start, -1)}T16:00:00Z`)
    .lt("starts_at", `${addDays(start, 7)}T16:00:00Z`)
    .order("starts_at");
  const people = [...new Map((shifts ?? []).map((s) => [s.membership_id, s.memberships?.display_name ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const dayOf = (iso: string) => todayIn(tz, new Date(iso));

  return (
    <>
      <PageHeader title="Schedule" subtitle={`Week of ${formatDate(start)}`}>
        <div className="flex gap-2">
          <Link className="btn-quiet" href={`?week=${addDays(start, -7)}`} aria-label="Previous week">‹</Link>
          <Link className="btn-quiet" href={`?week=${addDays(start, 7)}`} aria-label="Next week">›</Link>
        </div>
      </PageHeader>
      <div className="card overflow-x-auto">
        {people.length === 0 ? <Empty>No shifts this week.</Empty> : (
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>Person</th>
                {days.map((d) => <th key={d} className={d === today ? "text-brand" : ""}>{new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" })}</th>)}
              </tr>
            </thead>
            <tbody>
              {people.map(([id, name]) => (
                <tr key={id}>
                  <td className="font-medium">{name}</td>
                  {days.map((d) => {
                    const s = (shifts ?? []).find((x) => x.membership_id === id && dayOf(x.starts_at) === d);
                    return (
                      <td key={d} className="text-xs tabular-nums">
                        {s ? (
                          <span className="rounded-lg bg-brand/10 px-2 py-1 text-brand" title={sites.find((x) => x.id === s.site_id)?.name}>
                            {formatTime(s.starts_at, tz)}–{formatTime(s.ends_at, tz)}
                          </span>
                        ) : <span className="text-muted">Off</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
