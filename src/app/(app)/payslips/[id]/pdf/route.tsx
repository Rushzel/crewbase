import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { getContext } from "@/lib/context";
import { formatDate, formatDuration, formatMoney } from "@/lib/format";

// A payslip as a real, selectable PDF. Row-level security decides who may load it:
// the employee sees their own, payroll sees everyone's, and nobody else gets a row.
export async function GET(_: Request, ctx: RouteContext<"/payslips/[id]/pdf">) {
  const { id } = await ctx.params;
  const { supabase, org, settings } = await getContext();
  const { data: p } = await supabase
    .from("payslips")
    .select("*, pay_periods(starts_on, ends_on), memberships(display_name, employee_code), payslip_lines(position, kind, label, quantity, unit, amount_minor)")
    .eq("id", id)
    .single();
  if (!p) return new Response("Not found", { status: 404 });

  const money = (m: number) => formatMoney(m, settings.currency);
  const lines = [...(p.payslip_lines ?? [])].sort((a, b) => a.position - b.position);
  const s = StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1d1d1f" },
    brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: org.brand_color },
    muted: { color: "#6e6e73" },
    h: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6 },
    row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: "1 solid #e5e5ea" },
    total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, fontFamily: "Helvetica-Bold" },
  });
  const section = (kind: string, title: string) => (
    <View>
      <Text style={s.h}>{title}</Text>
      {lines.filter((l) => l.kind === kind).map((l) => (
        <View key={l.position} style={s.row}>
          <Text>{l.label}{l.quantity != null && kind === "earning" ? `  (${l.quantity} ${l.unit ?? ""})` : ""}</Text>
          <Text>{money(l.amount_minor)}</Text>
        </View>
      ))}
    </View>
  );

  const doc = (
    <Document title={`Payslip ${p.memberships?.display_name} ${p.pay_periods?.starts_on}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>{org.name}</Text>
        <Text style={[s.muted, { marginTop: 2 }]}>Payslip{p.status === "void" ? " (VOID)" : ""}</Text>
        <View style={{ marginTop: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{p.memberships?.display_name}</Text>
            <Text style={s.muted}>{p.memberships?.employee_code ?? ""}</Text>
          </View>
          <View>
            <Text>Period: {formatDate(p.pay_periods?.starts_on)} to {formatDate(p.pay_periods?.ends_on)}</Text>
            <Text style={s.muted}>Regular {formatDuration(p.regular_minutes)} · Overtime {formatDuration(p.overtime_minutes)}</Text>
          </View>
        </View>
        {section("earning", "Earnings")}
        <View style={s.total}><Text>Gross pay</Text><Text>{money(p.gross_minor)}</Text></View>
        {section("deduction", "Deductions")}
        <View style={s.total}><Text>Total deductions</Text><Text>{money(p.deductions_minor)}</Text></View>
        <View style={[s.total, { marginTop: 12, fontSize: 13 }]}><Text>Net pay</Text><Text>{money(p.net_minor)}</Text></View>
        {p.status === "void" && <Text style={{ marginTop: 12, color: "#d70015" }}>Voided: {p.void_reason}</Text>}
        <Text style={[s.muted, { marginTop: 24, fontSize: 8 }]}>
          Generated on {formatDate(p.generated_at, settings.timezone)} from approved time entries in a locked pay period.
          Lines marked as sample rates use illustrative rates, not current legal rates.
        </Text>
      </Page>
    </Document>
  );
  const buffer = await renderToBuffer(doc);
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="payslip-${p.pay_periods?.starts_on}.pdf"` },
  });
}
