import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { addSite } from "@/app/(app)/settings/setup-actions";
import { Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { AreaMap } from "@/components/area-map";

export const metadata = { title: "Areas" };

// Where people work and who leads each place. A team leader's team is the people in the areas they lead.
export default async function AreasPage() {
  const { supabase, org, settings, can } = await getContext();
  if (!can("sites.manage") && !can("people.manage")) redirect("/home");
  const [{ data: sites }, { data: assignments }, { data: shapes }, { data: members }] = await Promise.all([
    supabase.from("sites").select("id, name, address, active").eq("org_id", org.id).order("name"),
    supabase.from("member_sites").select("membership_id, site_id, is_leader").eq("org_id", org.id),
    supabase.rpc("site_geofences", { p_org: org.id }),
    supabase.from("memberships").select("id, display_name, roles(is_owner, role_permissions(permission))").eq("org_id", org.id).eq("status", "active").order("display_name"),
  ]);

  // People who time in (and aren't owners) are the ones who need an area.
  const workers = (members ?? []).filter((m) => !m.roles?.is_owner && m.roles?.role_permissions.some((p) => p.permission === "time.clock"));
  const assigned = new Set((assignments ?? []).map((a) => a.membership_id));
  const unassigned = workers.filter((w) => !assigned.has(w.id));
  const nameOf = new Map((members ?? []).map((m) => [m.id, m.display_name]));
  const label = settings.area_label.toLowerCase();
  const rows = (sites ?? []).map((s) => {
    const team = (assignments ?? []).filter((a) => a.site_id === s.id);
    return {
      ...s,
      leaders: team.filter((t) => t.is_leader).map((t) => nameOf.get(t.membership_id) ?? ""),
      size: team.filter((t) => !t.is_leader).length,
      fenced: (shapes ?? []).some((f) => f.site_id === s.id),
    };
  });
  const areas = (shapes ?? [])
    .filter((s) => (s.ring as unknown[] | null)?.length)
    .map((s) => ({ id: s.site_id, name: rows.find((r) => r.id === s.site_id)?.name ?? "", ring: s.ring as [number, number][] }));

  return (
    <>
      <PageHeader title={settings.area_label_plural} subtitle={`Each ${label} has a boundary checked at every time in, and a team.`} />
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label={settings.area_label_plural} value={rows.filter((r) => r.active).length} note={`${rows.filter((r) => !r.active).length} inactive`} />
        <Stat label="People assigned" value={workers.length - unassigned.length} note={`of ${workers.length} who time in`} />
        <Stat label={`Without a ${label}`} value={unassigned.length} />
        <Stat label="Without a leader" value={rows.filter((r) => r.active && r.leaders.length === 0).length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section className="card overflow-x-auto">
          {rows.length === 0 ? (
            <Empty>No {settings.area_label_plural.toLowerCase()} yet.</Empty>
          ) : (
            <table className="data-table">
              <thead><tr><th>{settings.area_label}</th><th>Leader</th><th className="text-right">Members</th><th>Boundary</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/areas/${r.id}`} className="font-medium hover:text-brand">{r.name}</Link>
                      {!r.active && <span className="ml-2"><Pill>Inactive</Pill></span>}
                      {r.address && <p className="text-xs text-muted">{r.address}</p>}
                    </td>
                    <td>{r.leaders.length ? r.leaders.join(", ") : <span className="text-muted">None</span>}</td>
                    <td className="text-right tabular-nums">{r.size}</td>
                    <td>{r.fenced ? <Pill tone="good">Drawn</Pill> : <Pill tone="bad">Missing</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <div className="space-y-4">
          <section className="card">
            <AreaMap areas={areas} />
          </section>
          {unassigned.length > 0 && (
            <section className="card">
              <h2 className="font-semibold">Not in any {label}</h2>
              <p className="mb-2 text-xs text-muted">They can&apos;t time in until they&apos;re added to a {label}, and no team leader sees them.</p>
              <ul className="text-sm">{unassigned.map((u) => <li key={u.id} className="py-0.5">{u.display_name}</li>)}</ul>
            </section>
          )}
          {can("sites.manage") && (
            <section className="card">
              <h2 className="mb-2 font-semibold">Add a {label}</h2>
              <Form action={addSite}>
                <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" className="field" required /></div>
                <div><label className="label" htmlFor="address">Address or description (optional)</label><input id="address" name="address" className="field" /></div>
                <button className="btn-primary">Add</button>
              </Form>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
