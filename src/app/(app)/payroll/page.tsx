import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { payrollStep } from "@/app/(app)/actions";
import { PageHeader, Pill, STATUS_TONE, statusLabel, Empty } from "@/components/ui";
import { formatDate, formatDuration, formatMoney } from "@/lib/format";

export const metadata = { title: "Payroll" };

const STEPS = ["open", "in_review", "locked", "finalized"] as const;

export default async function PayrollPage({ searchParams }: PageProps<"/payroll">) {
  const { supabase, org, settings, can } = await getContext();
  if (!can("payroll.run")) redirect("/payslips");
  const { data: periods } = await supabase.from("pay_periods").select("*").eq("org_id", org.id).order("starts_on", { ascending: false });
  const chosenId = (await searchParams).period;
  const period = (periods ?? []).find((p) => p.id === chosenId) ?? (periods ?? [])[0];
  const money = (m: number) => formatMoney(m, settings.currency);

  const [{ data: slips }, { data: approvals }, { data: members }, { data: without }] = period
    ? await Promise.all([
        supabase.from("payslips").select("id, membership_id, status, gross_minor, deductions_minor, net_minor, regular_minutes, overtime_minutes, late_minutes, absent_days, memberships(display_name)").eq("period_id", period.id).order("status"),
        supabase.from("timesheet_approvals").select("membership_id").eq("period_id", period.id),
        supabase.from("time_entries").select("membership_id, memberships(display_name)").eq("org_id", org.id).gte("work_date", period.starts_on).lte("work_date", period.ends_on),
        supabase.rpc("period_without_payslip", { p_period: period.id }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const approved = new Set((approvals ?? []).map((a) => a.membership_id));
  const people = [...new Map((members ?? []).map((m) => [m.membership_id, m.memberships?.display_name ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const live = (slips ?? []).filter((s) => s.status !== "void");
  const totals = live.reduce((t, s) => ({ gross: t.gross + s.gross_minor, ded: t.ded + s.deductions_minor, net: t.net + s.net_minor }), { gross: 0, ded: 0, net: 0 });

  return (
    <>
      <PageHeader title="Payroll" subtitle="Approved hours become payslips. Each step is enforced by the database.">
        <details className="relative">
          <summary className="btn-quiet cursor-pointer list-none">New pay period</summary>
          <Form action={payrollStep} className="card absolute right-0 z-10 mt-2 w-72 space-y-3">
            <input type="hidden" name="step" value="create" />
            <div><label className="label">Starts</label><input type="date" name="starts" className="field" required /></div>
            <div><label className="label">Ends</label><input type="date" name="ends" className="field" required /></div>
            <button className="btn-primary w-full">Create</button>
          </Form>
        </details>
      </PageHeader>

      {!period ? (
        <div className="card"><Empty>No pay periods yet.</Empty></div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(periods ?? []).map((p) => (
              <a key={p.id} href={`?period=${p.id}`} className={p.id === period.id ? "btn-primary" : "btn-quiet"}>
                {formatDate(p.starts_on)} – {formatDate(p.ends_on)}
              </a>
            ))}
          </div>

          <div className="card mb-4">
            <ol className="flex flex-wrap gap-2 text-sm">
              {STEPS.map((s, i) => (
                <li key={s} className={`pill ${STEPS.indexOf(period.status) >= i ? "bg-brand text-white" : "bg-canvas text-muted"}`}>
                  {i + 1}. {statusLabel(s)}
                </li>
              ))}
            </ol>
            <div className="mt-4">
              {period.status === "open" && (
                <Form action={payrollStep} className="flex items-center gap-3">
                  <input type="hidden" name="step" value="review" /><input type="hidden" name="period" value={period.id} />
                  <button className="btn-primary">Start review</button>
                  <p className="text-sm text-muted">Available once the period has ended. Managers then approve their teams&apos; timesheets.</p>
                </Form>
              )}
              {period.status === "in_review" && (
                <div className="space-y-4">
                  <p className="text-sm">{people.filter(([id]) => approved.has(id)).length} of {people.length} timesheets approved.</p>
                  <Form action={payrollStep} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="step" value="approve_all" /><input type="hidden" name="period" value={period.id} />
                    {people.filter(([id]) => !approved.has(id)).map(([id]) => <input key={id} type="hidden" name="member" value={id} />)}
                    <button className="btn-quiet" disabled={people.every(([id]) => approved.has(id))}>Approve all remaining timesheets</button>
                  </Form>
                  <Form action={payrollStep} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="step" value="lock" /><input type="hidden" name="period" value={period.id} />
                    <div className="min-w-64 flex-1"><label className="label">Override reason (only if some timesheets aren&apos;t approved)</label><input name="reason" className="field" /></div>
                    <button className="btn-primary">Lock period</button>
                  </Form>
                </div>
              )}
              {period.status === "locked" && (
                <div className="flex flex-wrap items-end gap-2">
                  <Form action={payrollStep}><input type="hidden" name="step" value="generate" /><input type="hidden" name="period" value={period.id} /><button className="btn-quiet">{live.length ? "Regenerate drafts" : "Generate payslips"}</button></Form>
                  <Form action={payrollStep}><input type="hidden" name="step" value="finalize" /><input type="hidden" name="period" value={period.id} /><button className="btn-primary" disabled={!live.length}>Finalize</button></Form>
                  <Form action={payrollStep} className="flex items-end gap-2">
                    <input type="hidden" name="step" value="unlock" /><input type="hidden" name="period" value={period.id} />
                    <input name="reason" placeholder="Reason to unlock" className="field w-56" />
                    <button className="btn-quiet">Unlock</button>
                  </Form>
                </div>
              )}
              {period.status === "finalized" && <p className="text-sm text-muted">Finalized on {formatDate(period.finalized_at, settings.timezone)}. Payslips can only be voided with a reason and reissued.</p>}
            </div>
          </div>

          {(without ?? []).length > 0 && period.status !== "open" && (
            <div className="card mb-4 text-sm">
              <p className="font-medium">No payslip</p>
              <p className="mt-1 text-muted">{(without ?? []).map((w) => `${w.display_name} (${w.reason})`).join(", ")}</p>
            </div>
          )}

          <div className="card overflow-x-auto">
            {live.length === 0 ? (
              <Empty>No payslips for this period yet.</Empty>
            ) : (
              <table className="data-table">
                <thead><tr><th>Person</th><th>Hours</th><th>Late</th><th>Absent</th><th className="text-right">Gross</th><th className="text-right">Deductions</th><th className="text-right">Net</th><th /></tr></thead>
                <tbody>
                  {(slips ?? []).map((s) => (
                    <tr key={s.id} className={s.status === "void" ? "opacity-50" : ""}>
                      <td>{s.memberships?.display_name} <Pill tone={STATUS_TONE[s.status]}>{statusLabel(s.status)}</Pill></td>
                      <td className="tabular-nums">{formatDuration(s.regular_minutes + s.overtime_minutes)}</td>
                      <td className="tabular-nums">{s.late_minutes ? `${s.late_minutes} min` : "–"}</td>
                      <td className="tabular-nums">{s.absent_days || "–"}</td>
                      <td className="text-right tabular-nums">{money(s.gross_minor)}</td>
                      <td className="text-right tabular-nums">{money(s.deductions_minor)}</td>
                      <td className="text-right font-medium tabular-nums">{money(s.net_minor)}</td>
                      <td className="text-right"><a className="text-sm text-brand" href={`/payslips/${s.id}/pdf`}>PDF</a></td>
                    </tr>
                  ))}
                  <tr className="font-medium"><td>Total ({live.length})</td><td /><td /><td /><td className="text-right tabular-nums">{money(totals.gross)}</td><td className="text-right tabular-nums">{money(totals.ded)}</td><td className="text-right tabular-nums">{money(totals.net)}</td><td /></tr>
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
