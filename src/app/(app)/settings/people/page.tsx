import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { inviteMember, saveMember, setRate } from "@/app/(app)/settings/setup-actions";
import { PageHeader, Pill, STATUS_TONE, statusLabel } from "@/components/ui";
import { formatDate, formatMoney, todayIn } from "@/lib/format";
import { SettingsTabs } from "@/components/settings-tabs";

export const metadata = { title: "People and pay" };

export default async function PeopleSettingsPage() {
  const { supabase, org, settings, can } = await getContext();
  if (!can("people.manage")) redirect("/today");
  const [{ data: members }, { data: roles }, { data: rates }] = await Promise.all([
    supabase.from("memberships").select("id, display_name, employee_code, role_id, manager_id, employment_type, status").eq("org_id", org.id).order("display_name"),
    supabase.from("roles").select("id, name").eq("org_id", org.id).order("name"),
    can("payroll.run") ? supabase.from("pay_rates").select("membership_id, basis, amount_minor, effective_from").eq("org_id", org.id).order("effective_from", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const latest = new Map<string, NonNullable<typeof rates>[number]>();
  (rates ?? []).forEach((r) => !latest.has(r.membership_id) && latest.set(r.membership_id, r));

  return (
    <>
      <PageHeader title="Settings" subtitle="People, roles, managers and pay rates." />
      <SettingsTabs />
      <section className="card mb-4">
        <h2 className="mb-3 font-semibold">Invite someone</h2>
        <Form action={inviteMember} className="grid gap-3 sm:grid-cols-5">
          <div className="sm:col-span-2"><label className="label">Email</label><input name="email" type="email" className="field" required /></div>
          <div><label className="label">Name</label><input name="name" className="field" required /></div>
          <div><label className="label">Role</label><select name="role" className="field">{(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div><label className="label">Manager</label><select name="manager" className="field"><option value="">None</option>{(members ?? []).map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></div>
          <button className="btn-primary sm:col-span-5 sm:justify-self-start">Create invitation</button>
        </Form>
      </section>
      <div className="space-y-3">
        {(members ?? []).map((m) => {
          const rate = latest.get(m.id);
          return (
            <details key={m.id} className="card">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{m.display_name} <span className="text-sm text-muted">{(roles ?? []).find((r) => r.id === m.role_id)?.name}</span></span>
                <span className="flex items-center gap-2 text-sm">
                  {rate && <span className="text-muted">{formatMoney(rate.amount_minor, settings.currency)} / {rate.basis.replace("ly", "").replace("dai", "day")}</span>}
                  <Pill tone={m.status === "active" ? "good" : STATUS_TONE[m.status] ?? "quiet"}>{statusLabel(m.status)}</Pill>
                </span>
              </summary>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Form action={saveMember} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="member" value={m.id} />
                  <div><label className="label">Name</label><input name="name" className="field" defaultValue={m.display_name} /></div>
                  <div><label className="label">Employee code</label><input name="code" className="field" defaultValue={m.employee_code ?? ""} /></div>
                  <div><label className="label">Role</label><select name="role" className="field" defaultValue={m.role_id}>{(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
                  <div><label className="label">Manager</label><select name="manager" className="field" defaultValue={m.manager_id ?? ""}><option value="">None</option>{(members ?? []).filter((x) => x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}</select></div>
                  <div><label className="label">Type</label><select name="employment_type" className="field" defaultValue={m.employment_type}><option value="regular">Regular</option><option value="provisional">Provisional</option><option value="contract">Contract</option></select></div>
                  <div><label className="label">Status</label><select name="status" className="field" defaultValue={m.status}><option value="active">Active</option><option value="inactive">Inactive</option>{m.status === "invited" && <option value="invited">Invited</option>}</select></div>
                  <button className="btn-primary sm:col-span-2 sm:justify-self-start">Save</button>
                </Form>
                {can("payroll.run") && (
                  <Form action={setRate} className="grid content-start gap-3 sm:grid-cols-3">
                    <input type="hidden" name="member" value={m.id} />
                    <div><label className="label">Pay basis</label><select name="basis" className="field" defaultValue={rate?.basis ?? "hourly"}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="monthly">Monthly</option></select></div>
                    <div><label className="label">Amount ({settings.currency})</label><input name="amount" type="number" step="0.01" className="field" defaultValue={rate ? rate.amount_minor / 100 : ""} required /></div>
                    <div><label className="label">From</label><input name="from" type="date" className="field" defaultValue={todayIn(settings.timezone)} required /></div>
                    <p className="text-xs text-muted sm:col-span-3">{rate ? `Current rate since ${formatDate(rate.effective_from)}. ` : ""}A new rate applies from its date; earlier days keep the old rate.</p>
                    <button className="btn-quiet sm:col-span-3 sm:justify-self-start">Set new rate</button>
                  </Form>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
