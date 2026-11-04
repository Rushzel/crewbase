import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { saveLeaveType } from "@/app/(app)/settings/setup-actions";
import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";

export const metadata = { title: "Leave types" };

export default async function LeaveTypesPage() {
  const { supabase, org, can } = await getContext();
  if (!can("people.manage")) redirect("/home");
  const { data: types } = await supabase.from("leave_types").select("*").eq("org_id", org.id).order("name");

  const fields = (t?: NonNullable<typeof types>[number]) => (
    <>
      <div className="min-w-36 flex-1"><label className="label">Name</label><input name="name" defaultValue={t?.name} className="field" required /></div>
      <div className="w-32"><label className="label">Days a year</label><input name="yearly_days" type="number" min={0} max={366} defaultValue={t?.yearly_days ?? ""} placeholder="No limit" className="field" /></div>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="paid" defaultChecked={t?.paid ?? true} /> Paid</label>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="needs_attachment" defaultChecked={t?.needs_attachment ?? false} /> Needs attachment</label>
      {t && <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={t.active} /> Active</label>}
    </>
  );

  return (
    <>
      <PageHeader title="Settings" subtitle="Leave types, how many working days a year each allows, and whether they're paid." />
      <SettingsTabs />
      <section className="card space-y-4">
        {(types ?? []).map((t) => (
          <Form key={t.id} action={saveLeaveType.bind(null, t.id)} className="flex flex-wrap items-end gap-3 border-b border-line pb-4">
            {fields(t)}
            <button className="btn-quiet">Save</button>
          </Form>
        ))}
        <div>
          <h2 className="mb-2 font-semibold">Add a leave type</h2>
          <Form action={saveLeaveType.bind(null, null)} className="flex flex-wrap items-end gap-3">
            {fields()}
            <button className="btn-primary">Add</button>
          </Form>
        </div>
        <p className="text-xs text-muted">
          Paid leave is paid on payslips. Unpaid leave on a scheduled day is deducted as leave, never counted as an absence.
          Changing an allowance applies to new requests and approvals; it doesn&apos;t undo approved leave.
        </p>
      </section>
    </>
  );
}
