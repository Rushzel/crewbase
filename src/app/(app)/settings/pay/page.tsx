import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { addDeduction, toggleDeduction } from "@/app/(app)/settings/setup-actions";
import { PageHeader, Pill } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Deductions" };

export default async function DeductionsPage() {
  const { supabase, org, settings, can } = await getContext();
  if (!can("payroll.run")) redirect("/home");
  const { data: rules } = await supabase.from("deduction_rules").select("*").eq("org_id", org.id).order("name");
  const describe = (r: NonNullable<typeof rules>[number]) =>
    r.kind === "fixed" ? `${formatMoney(Number(r.value), settings.currency)} per payslip`
      : r.kind === "percent" ? `${Number(r.value)}% of gross`
      : `Bracket table (${Array.isArray(r.brackets) ? r.brackets.length : 0} brackets)`;

  return (
    <>
      <PageHeader title="Settings" subtitle="Deductions applied to every payslip, in name order, after absences and tardiness." />
      <SettingsTabs />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="card">
          <ul className="divide-y divide-line">
            {(rules ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-medium">{r.name} {r.is_sample && <Pill tone="warn">Sample rate</Pill>}</p>
                  <p className="text-xs text-muted">{describe(r)}</p>
                </div>
                <form action={toggleDeduction.bind(null, r.id, !r.active)}>
                  <button className={r.active ? "btn-primary" : "btn-quiet"} aria-pressed={r.active}>{r.active ? "Active" : "Off"}</button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Sample rates are illustrative, not current legal contribution or tax rates. Check the law before using them.</p>
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Add a deduction</h2>
          <Form action={addDeduction}>
            <div><label className="label">Name</label><input name="name" className="field" required /></div>
            <div><label className="label">Type</label><select name="kind" className="field"><option value="percent">Percent of gross</option><option value="fixed">Fixed amount</option></select></div>
            <div><label className="label">Value (percent, or amount in {settings.currency})</label><input name="value" type="number" step="0.01" min="0" className="field" required /></div>
            <button className="btn-primary">Add</button>
          </Form>
          <p className="mt-3 text-xs text-muted">Changes apply to payslips generated from now on. Final payslips keep the rules they used.</p>
        </section>
      </div>
    </>
  );
}
