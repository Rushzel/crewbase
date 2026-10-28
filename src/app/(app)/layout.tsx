import Link from "next/link";
import { getContext } from "@/lib/context";
import { PRODUCT_NAME } from "@/lib/brand";
import { signOut, switchBusiness } from "@/app/auth-actions";
import { NavLink } from "@/components/nav-link";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getContext();
  const nav = [
    { href: "/today", label: "Today", show: ctx.has("time_tracking") },
    { href: "/history", label: "History", show: ctx.has("time_tracking") },
    { href: "/requests", label: "Requests", show: ctx.has("corrections") },
    { href: "/people", label: "People", show: ctx.role.scope !== "own" },
    { href: "/schedule", label: "Schedule", show: ctx.has("scheduling") },
    { href: "/payslips", label: "Payslips", show: ctx.has("payroll") },
    { href: "/payroll", label: "Payroll", show: ctx.has("payroll") && ctx.can("payroll.run") },
    { href: "/analytics", label: "Analytics", show: ctx.has("analytics") && ctx.can("analytics.view") },
    { href: "/face", label: "Face check", show: ctx.has("face_verification") },
    { href: "/settings", label: "Settings", show: ctx.can("settings.manage") },
  ].filter((n) => n.show);

  return (
    <div className="min-h-screen md:flex" style={{ ["--brand" as string]: ctx.org.brand_color }}>
      <aside className="border-b border-line bg-card md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
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
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="hidden p-4 md:absolute md:bottom-0 md:block md:w-60">
          <p className="text-sm font-medium">{ctx.me.display_name}</p>
          <p className="text-xs text-muted">{ctx.role.name}</p>
          <form action={signOut}>
            <button className="mt-2 text-xs text-muted hover:text-ink">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {ctx.org.is_demo && (
          <div className="border-b border-line bg-card px-4 py-2 text-xs text-muted md:px-8">
            You&apos;re using a demo account in a made-up business. Data resets every night.{" "}
            <Link href="/" className="text-brand">Switch role</Link>
            <form action={signOut} className="inline md:hidden"> · <button className="text-brand">Sign out</button></form>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
