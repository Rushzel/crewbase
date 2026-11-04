import { redirect } from "next/navigation";
import { getContext, type Permission } from "@/lib/context";
import { Form } from "@/components/form";
import { deleteRole, saveRole } from "@/app/(app)/settings/setup-actions";
import { PageHeader, Pill } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";

export const metadata = { title: "Roles" };

// The fixed list of permissions, so the database always knows exactly what each one allows.
const PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  { key: "time.clock", label: "Time in and out", group: "Own work" },
  { key: "sales.log", label: "Log sales", group: "Own work" },
  { key: "analytics.view", label: "See analytics", group: "Own work" },
  { key: "requests.review", label: "Approve corrections", group: "Team" },
  { key: "leave.review", label: "Approve leave", group: "Team" },
  { key: "sales.review", label: "Approve sales", group: "Team" },
  { key: "time.edit", label: "Edit time records (with a reason)", group: "Team" },
  { key: "schedule.manage", label: "Plan shifts", group: "Team" },
  { key: "face.enroll_others", label: "Enroll faces for their team", group: "Team" },
  { key: "people.manage", label: "Manage accounts, area teams and leave types", group: "Business" },
  { key: "sites.manage", label: "Manage areas and boundaries", group: "Business" },
  { key: "products.manage", label: "Manage products", group: "Business" },
  { key: "payroll.run", label: "Run payroll and set pay rates", group: "Business" },
  { key: "audit.view", label: "Read the audit trail", group: "Business" },
  { key: "settings.manage", label: "Change settings, features and roles", group: "Business" },
];
const SCOPES = [
  { key: "own", label: "Only themself" },
  { key: "team", label: "Their team: the areas they lead and their reports" },
  { key: "all", label: "Everyone in the business" },
];

export default async function RolesPage() {
  const { supabase, org, can } = await getContext();
  if (!can("settings.manage")) redirect("/home");
  const [{ data: roles }, { data: members }] = await Promise.all([
    supabase.from("roles").select("id, name, scope, is_owner, role_permissions(permission)").eq("org_id", org.id).order("is_owner", { ascending: false }).order("name"),
    supabase.from("memberships").select("role_id").eq("org_id", org.id).neq("status", "inactive"),
  ]);
  const count = (id: string) => (members ?? []).filter((m) => m.role_id === id).length;

  const fields = (r?: NonNullable<typeof roles>[number]) => {
    const has = new Set((r?.role_permissions ?? []).map((p) => p.permission));
    const key = r?.id ?? "new";
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor={`name-${key}`}>Name</label><input id={`name-${key}`} name="name" defaultValue={r?.name} className="field" required /></div>
          <div>
            <label className="label" htmlFor={`scope-${key}`}>Sees the records of</label>
            <select id={`scope-${key}`} name="scope" defaultValue={r?.scope ?? "own"} className="field">
              {SCOPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {["Own work", "Team", "Business"].map((g) => (
            <fieldset key={g}>
              <legend className="label">{g}</legend>
              {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                <label key={p.key} className="flex items-start gap-2 py-0.5 text-sm">
                  <input type="checkbox" name="perm" value={p.key} defaultChecked={has.has(p.key)} className="mt-1" /> {p.label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </>
    );
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Name your own roles and build them from a fixed list of permissions. Every change is in the audit trail." />
      <SettingsTabs />
      <div className="space-y-3">
        {(roles ?? []).map((r) => (
          <details key={r.id} className="card">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{r.name} {r.is_owner && <Pill tone="info">Owner</Pill>}</span>
              <span className="text-sm text-muted">
                {count(r.id)} {count(r.id) === 1 ? "person" : "people"} · {r.role_permissions.length} permissions · sees {r.scope === "all" ? "everyone" : r.scope === "team" ? "their team" : "only themself"}
              </span>
            </summary>
            {r.is_owner ? (
              <p className="mt-3 text-sm text-muted">The owner role always has every permission and sees everyone, so a business can never lock itself out.</p>
            ) : (
              <div className="mt-4 space-y-3">
                <Form action={saveRole.bind(null, r.id)} className="space-y-4">
                  {fields(r)}
                  <button className="btn-primary">Save role</button>
                </Form>
                {count(r.id) === 0 ? (
                  <Form action={deleteRole.bind(null, r.id)}>
                    <button className="btn-danger">Remove role</button>
                  </Form>
                ) : (
                  <p className="text-xs text-muted">To remove this role, give its people another role first.</p>
                )}
              </div>
            )}
          </details>
        ))}
        <section className="card">
          <h2 className="mb-3 font-semibold">Add a role</h2>
          <Form action={saveRole.bind(null, null)} className="space-y-4">
            {fields()}
            <button className="btn-primary">Add role</button>
          </Form>
        </section>
      </div>
    </>
  );
}
