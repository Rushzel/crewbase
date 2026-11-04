import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { saveArea, saveAreaTeam } from "@/app/(app)/settings/setup-actions";
import { PageHeader } from "@/components/ui";
import { GeofenceEditor } from "@/components/geofence-editor";

export const metadata = { title: "Area" };

export default async function AreaPage({ params }: PageProps<"/areas/[id]">) {
  const { id } = await params;
  const { supabase, org, settings, can } = await getContext();
  if (!can("sites.manage") && !can("people.manage")) redirect("/home");
  const [{ data: site }, { data: shapes }, { data: team }, { data: members }] = await Promise.all([
    supabase.from("sites").select("id, name, address, active").eq("id", id).eq("org_id", org.id).maybeSingle(),
    supabase.rpc("site_geofences", { p_org: org.id }),
    supabase.from("member_sites").select("membership_id, site_id, is_leader").eq("org_id", org.id),
    supabase.from("memberships").select("id, display_name, roles(name, scope, is_owner, role_permissions(permission))").eq("org_id", org.id).eq("status", "active").order("display_name"),
  ]);
  if (!site) notFound();

  const fences = (shapes ?? []).filter((f) => f.site_id === id).map((f) => ({
    kind: f.kind, radius_m: f.radius_m, center: null, ring: (f.ring as [number, number][]) ?? [],
  }));
  const start: [number, number] = fences[0]?.ring[0] ?? (shapes ?? []).map((s) => (s.ring as [number, number][])?.[0]).find(Boolean) ?? [14.5995, 120.9842];
  const here = new Map((team ?? []).filter((t) => t.site_id === id).map((t) => [t.membership_id, t.is_leader]));
  const elsewhere = new Map<string, number>();
  for (const t of team ?? []) if (t.site_id !== id) elsewhere.set(t.membership_id, (elsewhere.get(t.membership_id) ?? 0) + 1);
  const people = (members ?? []).filter((m) => !m.roles?.is_owner && m.roles?.role_permissions.some((p) => p.permission === "time.clock"));
  // Leaders are usually people whose role sees a team; anyone can be made one.
  const leaderFirst = [...people].sort((a, b) => Number(b.roles?.scope === "team") - Number(a.roles?.scope === "team") || a.display_name.localeCompare(b.display_name));
  const label = settings.area_label.toLowerCase();

  return (
    <>
      <PageHeader title={site.name} subtitle={site.address ?? undefined}>
        <Link href="/areas" className="btn-quiet">All {settings.area_label_plural.toLowerCase()}</Link>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="card">
          <h2 className="mb-1 font-semibold">Boundary</h2>
          <p className="mb-3 text-xs text-muted">
            {fences.length ? "A time in inside the green shape passes the location check." : `No boundary yet: time in here will fail the location check.`}
          </p>
          {can("sites.manage") ? (
            <GeofenceEditor key={id} siteId={id} fences={fences} start={start} />
          ) : (
            <p className="text-sm text-muted">Only people who manage {settings.area_label_plural.toLowerCase()} can change the boundary.</p>
          )}
        </section>
        {can("sites.manage") && (
          <section className="card">
            <h2 className="mb-2 font-semibold">Details</h2>
            <Form action={saveArea.bind(null, id)}>
              <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" defaultValue={site.name} className="field" required /></div>
              <div><label className="label" htmlFor="address">Address or description</label><input id="address" name="address" defaultValue={site.address ?? ""} className="field" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={site.active} /> Active (people can time in here)</label>
              <button className="btn-primary">Save</button>
            </Form>
          </section>
        )}
      </div>

      <section className="card mt-4">
        <h2 className="font-semibold">Team</h2>
        <p className="mb-3 text-xs text-muted">
          Members can time in here. Leaders also see the members&apos; time, leave and sales. Someone can belong to more than one {label}.
        </p>
        {can("people.manage") ? (
          <Form action={saveAreaTeam.bind(null, id)}>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Person</th><th>Role</th><th className="text-center">Member</th><th className="text-center">Leader</th><th>Also in</th></tr></thead>
                <tbody>
                  {leaderFirst.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.display_name}</td>
                      <td className="text-muted">{p.roles?.name}</td>
                      <td className="text-center"><input type="checkbox" name="member" value={p.id} defaultChecked={here.has(p.id)} aria-label={`${p.display_name} is a member`} /></td>
                      <td className="text-center"><input type="checkbox" name="leader" value={p.id} defaultChecked={here.get(p.id) === true} aria-label={`${p.display_name} leads this ${label}`} /></td>
                      <td className="text-xs text-muted">{elsewhere.get(p.id) ? `${elsewhere.get(p.id)} other` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn-primary">Save team</button>
          </Form>
        ) : (
          <ul className="text-sm">
            {people.filter((p) => here.has(p.id)).map((p) => <li key={p.id}>{p.display_name}{here.get(p.id) ? " (leader)" : ""}</li>)}
          </ul>
        )}
      </section>
    </>
  );
}
