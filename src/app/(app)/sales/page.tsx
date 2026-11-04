import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { ResendButton, SaleForm } from "@/components/sale-form";
import { Empty, PageHeader, Pill, STATUS_TONE, Stat, statusLabel } from "@/components/ui";
import { cancelSale, decideSale } from "@/app/(app)/sales/actions";
import { formatDate, formatMoney, todayIn } from "@/lib/format";

export const metadata = { title: "Sales" };

const STATUSES = ["awaiting_verification", "follow_up", "for_approval", "approved", "rejected", "cancelled"] as const;
type Status = (typeof STATUSES)[number];

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  const { supabase, org, me, settings, role, can, has } = await getContext();
  if (!has("sales") || !(can("sales.log") || can("sales.review"))) redirect("/home");
  const tz = settings.timezone;
  const q = await searchParams;
  const status = STATUSES.includes(q.status as Status) ? (q.status as Status) : null;
  const team = role.scope !== "own";
  const monthStart = `${todayIn(tz).slice(0, 7)}-01`;

  const [{ data: products }, { data: apps }] = await Promise.all([
    supabase.from("products").select("id, name, price_minor, needs_verification").eq("org_id", org.id).eq("active", true).order("sort").order("name"),
    supabase.from("customer_applications")
      .select("id, membership_id, customer_name, customer_email, customer_phone, status, price_minor, incentive_minor, verified_at, decided_at, decision_note, created_at, resend_count, products(name), sites(name), memberships!customer_applications_membership_id_org_id_fkey(display_name)")
      .eq("org_id", org.id).order("created_at", { ascending: false }).limit(500),
  ]);
  const all = apps ?? [];
  const count = (s: Status) => all.filter((a) => a.status === s).length;
  const rows = status ? all.filter((a) => a.status === status) : all.slice(0, 100);
  const queue = can("sales.review") ? all.filter((a) => a.status === "for_approval" && a.membership_id !== me.id).reverse() : [];
  const approvedThisMonth = all.filter((a) => a.status === "approved" && a.decided_at && todayIn(tz, new Date(a.decided_at)) >= monthStart);

  // Ranking: approved sales this month per person (only for people who see a team).
  const ranking = [...approvedThisMonth.reduce((m, a) => {
    const r = m.get(a.membership_id) ?? { name: a.memberships?.display_name ?? "", sales: 0, value: 0, incentive: 0 };
    r.sales += 1; r.value += Number(a.price_minor); r.incentive += Number(a.incentive_minor);
    return m.set(a.membership_id, r);
  }, new Map<string, { name: string; sales: number; value: number; incentive: number }>()).values()].sort((a, b) => b.sales - a.sales || b.value - a.value);

  const money = (m: number) => formatMoney(m, settings.currency);

  return (
    <>
      <PageHeader title="Sales" subtitle={team ? "Customer applications from the people you can see." : "Your customer applications."} />

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Approved this month" value={approvedThisMonth.length} note={money(approvedThisMonth.reduce((s, a) => s + Number(a.price_minor), 0))} />
        <Stat label="Incentives this month" value={money(approvedThisMonth.reduce((s, a) => s + Number(a.incentive_minor), 0))} note="Added to payslips" />
        <Stat label="Waiting for customer" value={count("awaiting_verification")} note={`${count("follow_up")} to follow up`} />
        <Stat label="Ready for approval" value={count("for_approval")} />
      </div>

      {queue.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-3 font-semibold">Ready for approval <Pill tone="info">{queue.length}</Pill></h2>
          <ul className="divide-y divide-line">
            {queue.map((a) => (
              <li key={a.id} className="grid gap-3 py-3 md:grid-cols-[2fr_3fr]">
                <div className="text-sm">
                  <p className="font-medium">{a.customer_name} · {a.products?.name} · {money(Number(a.price_minor))}</p>
                  <p className="text-muted">
                    By {a.memberships?.display_name}{a.sites?.name ? ` in ${a.sites.name}` : ""} · {formatDate(a.created_at, tz)}
                    {a.verified_at ? " · confirmed by the customer" : " · no confirmation needed"}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <Form action={decideSale.bind(null, a.id, true)} className="flex items-start gap-2">
                    <button className="btn-primary">Approve</button>
                  </Form>
                  <Form action={decideSale.bind(null, a.id, false)} className="flex flex-1 flex-wrap items-start gap-2">
                    <input name="note" placeholder="Why not?" className="field min-w-40 flex-1" aria-label="Reason for rejecting" required />
                    <button className="btn-danger">Reject</button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="card overflow-x-auto">
          <nav className="mb-3 flex flex-wrap gap-1 text-sm" aria-label="Filter by status">
            <Link href="/sales" className={`rounded-full px-3 py-1 ${!status ? "bg-brand/10 font-medium text-brand" : "hover:bg-canvas"}`}>Latest</Link>
            {STATUSES.map((s) => (
              <Link key={s} href={`/sales?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-brand/10 font-medium text-brand" : "hover:bg-canvas"}`}>
                {statusLabel(s)} <span className="text-muted">{count(s)}</span>
              </Link>
            ))}
          </nav>
          {rows.length === 0 ? <Empty>No applications here.</Empty> : (
            <table className="data-table">
              <thead>
                <tr><th>Logged</th><th>Customer</th><th>Product</th>{team && <th>By</th>}<th>Status</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap">{formatDate(a.created_at, tz)}</td>
                    <td>{a.customer_name}<p className="text-xs text-muted">{a.customer_email}</p></td>
                    <td>{a.products?.name}<p className="text-xs text-muted">{money(Number(a.price_minor))}</p></td>
                    {team && <td>{a.memberships?.display_name}<p className="text-xs text-muted">{a.sites?.name}</p></td>}
                    <td>
                      <Pill tone={STATUS_TONE[a.status] ?? "quiet"}>{statusLabel(a.status)}</Pill>
                      {a.decision_note && <p className="mt-1 max-w-56 text-xs text-muted">{a.decision_note}</p>}
                    </td>
                    <td className="min-w-40">
                      {a.membership_id === me.id && (a.status === "awaiting_verification" || a.status === "follow_up") && a.resend_count < 3 && <ResendButton id={a.id} />}
                      {a.membership_id === me.id && ["awaiting_verification", "follow_up", "for_approval"].includes(a.status) && (
                        <details className="mt-1 text-sm">
                          <summary className="cursor-pointer text-muted">Cancel</summary>
                          <Form action={cancelSale.bind(null, a.id)} className="mt-2 flex gap-2">
                            <input name="reason" placeholder="Reason" className="field" aria-label="Reason for cancelling" required />
                            <button className="btn-danger">Cancel sale</button>
                          </Form>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="space-y-4">
          {can("sales.log") && (
            <section className="card">
              <h2 className="mb-2 font-semibold">Log a sale</h2>
              {(products ?? []).length === 0 ? <Empty>No products yet.</Empty> : (
                <SaleForm products={(products ?? []).map((p) => ({ id: p.id, name: p.name, price: money(Number(p.price_minor)), needs_verification: p.needs_verification }))} />
              )}
              <p className="mt-3 text-xs text-muted">
                The customer gets a link to confirm. Unconfirmed sales move to follow up after {settings.follow_up_hours} hours.
              </p>
            </section>
          )}
          {team && ranking.length > 0 && (
            <section className="card">
              <h2 className="mb-2 font-semibold">Approved this month</h2>
              <ol className="space-y-1.5 text-sm">
                {ranking.map((r, i) => (
                  <li key={r.name} className="flex items-center justify-between gap-2">
                    <span><span className="inline-block w-6 text-muted">{i + 1}.</span>{r.name}</span>
                    <span className="tabular-nums text-muted">{r.sales} · {money(r.incentive)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
