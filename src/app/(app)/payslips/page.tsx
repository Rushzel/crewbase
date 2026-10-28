import { getContext } from "@/lib/context";
import { PageHeader, Pill, STATUS_TONE, statusLabel, Empty } from "@/components/ui";
import { formatDate, formatDuration, formatMoney } from "@/lib/format";

export const metadata = { title: "Payslips" };

// The employee portal: your own payslips, replacing payslips sent one by one in chat.
export default async function PayslipsPage() {
  const { supabase, me, settings } = await getContext();
  const { data: slips } = await supabase
    .from("payslips")
    .select("id, status, gross_minor, deductions_minor, net_minor, regular_minutes, overtime_minutes, void_reason, pay_periods(starts_on, ends_on)")
    .eq("membership_id", me.id)
    .neq("status", "draft")
    .order("generated_at", { ascending: false });
  return (
    <>
      <PageHeader title="Payslips" subtitle="Your payslips. Final payslips can't be changed; a corrected one replaces a voided one." />
      <div className="card overflow-x-auto">
        {(slips ?? []).length === 0 ? (
          <Empty>No payslips yet. They appear here once a pay period is finalized.</Empty>
        ) : (
          <table className="data-table">
            <thead><tr><th>Period</th><th>Hours</th><th className="text-right">Gross</th><th className="text-right">Deductions</th><th className="text-right">Net</th><th /></tr></thead>
            <tbody>
              {(slips ?? []).map((s) => (
                <tr key={s.id}>
                  <td>{formatDate(s.pay_periods?.starts_on)} – {formatDate(s.pay_periods?.ends_on)} <Pill tone={STATUS_TONE[s.status]}>{statusLabel(s.status)}</Pill></td>
                  <td className="tabular-nums">{formatDuration(s.regular_minutes + s.overtime_minutes)}</td>
                  <td className="text-right tabular-nums">{formatMoney(s.gross_minor, settings.currency)}</td>
                  <td className="text-right tabular-nums">{formatMoney(s.deductions_minor, settings.currency)}</td>
                  <td className="text-right font-medium tabular-nums">{formatMoney(s.net_minor, settings.currency)}</td>
                  <td className="text-right"><a className="text-sm text-brand" href={`/payslips/${s.id}/pdf`}>PDF</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
