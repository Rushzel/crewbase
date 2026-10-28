import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { addSite } from "@/app/(app)/settings/setup-actions";
import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { GeofenceEditor } from "@/components/geofence-editor";

export const metadata = { title: "Sites and geofences" };

export default async function SitesPage({ searchParams }: PageProps<"/settings/sites">) {
  const { supabase, org, can } = await getContext();
  if (!can("sites.manage")) redirect("/today");
  const [{ data: sites }, { data: shapes }] = await Promise.all([
    supabase.from("sites").select("id, name, address").eq("org_id", org.id).order("name"),
    supabase.rpc("site_geofences", { p_org: org.id }),
  ]);
  const chosen = (await searchParams).site;
  const site = (sites ?? []).find((s) => s.id === chosen) ?? (sites ?? [])[0];
  const fences = (shapes ?? []).filter((f) => f.site_id === site?.id).map((f) => ({
    kind: f.kind, radius_m: f.radius_m, center: null, ring: (f.ring as [number, number][]) ?? [],
  }));
  const start: [number, number] = fences[0]?.ring[0] ?? [14.5547, 121.0244];

  return (
    <>
      <PageHeader title="Settings" subtitle="Each site's geofence is checked by the database at every time in and out." />
      <SettingsTabs />
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          <section className="card">
            <h2 className="mb-2 font-semibold">Sites</h2>
            <ul className="space-y-1">
              {(sites ?? []).map((s) => (
                <li key={s.id}>
                  <a href={`?site=${s.id}`} className={`block rounded-xl px-3 py-2 text-sm ${s.id === site?.id ? "bg-brand/10 font-medium text-brand" : "hover:bg-canvas"}`}>{s.name}</a>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2 className="mb-2 font-semibold">Add a site</h2>
            <Form action={addSite}>
              <div><label className="label">Name</label><input name="name" className="field" required /></div>
              <div><label className="label">Address (optional)</label><input name="address" className="field" /></div>
              <button className="btn-primary">Add site</button>
            </Form>
          </section>
        </div>
        {site && (
          <section className="card">
            <h2 className="mb-1 font-semibold">{site.name}</h2>
            <p className="mb-3 text-xs text-muted">{fences.length ? `${fences.length} saved geofence${fences.length > 1 ? "s" : ""} (green). A punch inside any of them passes.` : "No geofence yet: time in here will fail the location check."}</p>
            <GeofenceEditor key={site.id} siteId={site.id} fences={fences} start={start} />
          </section>
        )}
      </div>
    </>
  );
}
