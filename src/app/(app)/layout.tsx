import Link from "next/link";
import { getContext } from "@/lib/context";
import { PRODUCT_NAME } from "@/lib/brand";
import { signOut, switchBusiness } from "@/app/auth-actions";
import { NavLink } from "@/components/nav-link";
import { initials } from "@/components/ui";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getContext();
  const team = ctx.role.scope !== "own";
  // Built from permissions and features, not role names: a business can rename its roles.
  const sections = [
    { title: null, items: [{ href: "/home", label: "Home", show: true }] },
    {
      title: "My work",
      items: [
        { href: "/today", label: "Time in and out", show: ctx.has("time_tracking") && ctx.can("time.clock") },
        { href: "/history", label: "My time", show: ctx.has("time_tracking") && ctx.can("time.clock") },
        { href: "/requests", label: "Corrections", show: ctx.has("corrections") && !team },
        { href: "/leave", label: "Leave", show: ctx.has("leave") },
        { href: "/sales", label: "Sales", show: ctx.has("sales") && (ctx.can("sales.log") || ctx.can("sales.review")) },
        { href: "/payslips", label: "Payslips", show: ctx.has("payroll") },
        { href: "/face", label: "Face check", show: ctx.has("face_verification") },
      ],
    },
    {
      title: "Team",
      items: [
        { href: "/team", label: "Team today", show: team && ctx.has("time_tracking") },
        { href: "/requests", label: "Corrections", show: team && ctx.has("corrections") },
        { href: "/schedule", label: "Schedule", show: team && ctx.has("scheduling") },
        { href: "/analytics", label: "Analytics", show: ctx.has("analytics") && ctx.can("analytics.view") },
      ],
    },
    {
      title: "Business",
      items: [
        { href: "/areas", label: ctx.settings.area_label_plural, show: ctx.can("sites.manage") || ctx.can("people.manage") },
        { href: "/products", label: "Products", show: ctx.has("sales") && ctx.can("products.manage") },
        { href: "/settings/people", label: "Accounts", show: ctx.can("people.manage") },
        { href: "/payroll", label: "Payroll", show: ctx.has("payroll") && ctx.can("payroll.run") },
        { href: "/audit", label: "Audit trail", show: ctx.can("audit.view") || ctx.can("settings.manage") },
        { href: "/settings/general", label: "Settings", show: ctx.can("settings.manage") },
      ],
    },
  ]
    .map((s) => ({ ...s, items: s.items.filter((i) => i.show) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="min-h-screen md:flex" style={{ ["--brand" as string]: ctx.org.brand_color }}>
      <aside className="border-b border-line bg-card md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between p-4 md:block">
          <div>
            <p className="text-xs text-muted">{PRODUCT_NAME}</p>
            <p className="font-semibold" style={{ color: ctx.org.brand_color }}>{ctx.org.name}</p>
          </div>
          {ctx.memberships.length > 1 && (
            <form className="mt-0 md:mt-2">
              {ctx.memberships
                .filter((m) => m.org_id !== ctx.org.id)
                .map((m) => (
                  <button key={m.org_id} formAction={switchBusiness.bind(null, m.org_id)} className="text-xs text-brand">
                    Switch to {m.organizations?.name}
                  </button>
                ))}
            </form>
          )}
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:overflow-y-auto md:pb-4">
          {sections.map((s) => (
            <div key={s.title ?? "top"} className="contents md:block md:pt-3 md:first:pt-0">
              {s.title && <p className="hidden px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted md:block">{s.title}</p>}
              <div className="contents md:flex md:flex-col md:gap-0.5">
                {s.items.map((n) => (
                  <NavLink key={n.href} href={n.href}>{n.label}</NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="hidden border-t border-line p-4 md:block">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
              {initials(ctx.me.display_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{ctx.me.display_name}</p>
              <p className="truncate text-xs text-muted">{ctx.role.name}</p>
            </div>
          </div>
          <form action={signOut}>
            <button className="mt-3 text-xs text-muted hover:text-ink">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {ctx.org.is_demo && (
          <div className="border-b border-line bg-card px-4 py-2 text-xs text-muted md:px-8">
            You&apos;re signed in as {ctx.me.display_name} ({ctx.role.name}) in a made-up business. Data resets every night.{" "}
            <Link href="/" className="text-brand">Switch role</Link>
            <form action={signOut} className="inline md:hidden"> · <button className="text-brand">Sign out</button></form>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
