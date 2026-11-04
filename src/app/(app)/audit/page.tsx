import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Empty, PageHeader } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";

export const metadata = { title: "Audit trail" };

const TABLES: Record<string, string> = {
  memberships: "People", roles: "Roles", role_permissions: "Role permissions", org_settings: "Settings", org_features: "Features", sites: "Areas",
  member_sites: "Area teams", pay_rates: "Pay rates", deduction_rules: "Deductions", pay_periods: "Pay periods",
  leave_types: "Leave types", leave_requests: "Leave", products: "Products", customer_applications: "Sales",
};
const ACTIONS: Record<string, string> = { insert: "Added", update: "Changed", delete: "Removed" };
const HIDDEN = new Set(["id", "org_id", "created_at"]);

// Fields whose value differs between the old and new row.
function changes(oldV: unknown, newV: unknown): string[] {
  const o = (oldV ?? {}) as Record<string, unknown>;
  const n = (newV ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(o), ...Object.keys(n)])]
    .filter((k) => !HIDDEN.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => k.replace(/_/g, " "));
}

// A role permission change, as "Team Leader: leave.review".
function permissionChange(v: unknown): string | undefined {
  const p = v as { role?: string; permission?: string } | null;
  return p?.role && p.permission ? `${p.role}: ${p.permission}` : undefined;
}

// The append-only audit log. Nobody can edit or delete it, including owners.
export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const { supabase, org, settings, can } = await getContext();
  if (!can("audit.view") && !can("settings.manage")) redirect("/home");
  const tz = settings.timezone;
  const q = await searchParams;
  const table = typeof q.table === "string" && TABLES[q.table] ? q.table : "";
  const before = typeof q.before === "string" && /^\d+$/.test(q.before) ? Number(q.before) : null;

  let query = supabase.from("audit_log").select("id, actor, action, table_name, row_id, old_value, new_value, reason, at")
    .eq("org_id", org.id).order("id", { ascending: false }).limit(100);
  if (table) query = query.eq("table_name", table);
  if (before) query = query.lt("id", before);
  const [{ data: rows }, { data: people }] = await Promise.all([
    query,
    supabase.from("memberships").select("user_id, display_name").eq("org_id", org.id),
  ]);
  const who = new Map((people ?? []).filter((p) => p.user_id).map((p) => [p.user_id!, p.display_name]));
  const last = rows?.at(-1)?.id;

  return (
    <>
      <PageHeader title="Audit trail" subtitle="Every change to people, roles, areas, settings, pay, leave and sales. It can't be edited or deleted.">
        <form className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="table">Show</label>
            <select id="table" name="table" defaultValue={table} className="field">
              <option value="">Everything</option>
              {Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button className="btn-quiet">Filter</button>
        </form>
      </PageHeader>
      <section className="card overflow-x-auto">
        {(rows ?? []).length === 0 ? <Empty>No changes recorded.</Empty> : (
          <table className="data-table">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Fields</th><th>Reason</th></tr></thead>
            <tbody>
              {(rows ?? []).map((r) => {
                const name = (r.new_value as { display_name?: string; name?: string } | null)?.display_name
                  ?? (r.new_value as { name?: string } | null)?.name ?? (r.old_value as { name?: string } | null)?.name
                  ?? permissionChange(r.new_value ?? r.old_value);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDate(r.at, tz)}<p className="text-xs text-muted">{formatTime(r.at, tz)}</p></td>
                    <td>{r.actor ? who.get(r.actor) ?? "Someone outside the business" : "The system"}</td>
                    <td>{ACTIONS[r.action] ?? r.action} {TABLES[r.table_name]?.toLowerCase() ?? r.table_name}{name ? `: ${name}` : ""}</td>
                    <td className="max-w-72 text-xs text-muted">{r.action === "update" ? changes(r.old_value, r.new_value).join(", ") : ""}</td>
                    <td className="text-sm">{r.reason ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {rows && rows.length === 100 && last && (
          <Link href={`/audit?${new URLSearchParams({ ...(table ? { table } : {}), before: String(last) })}`} className="btn-quiet mt-3">Older</Link>
        )}
      </section>
    </>
  );
}
