import Link from "next/link";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { DEMO, demoEmail } from "@/lib/demo";

// Placeholder landing page; its design waits for Kidd's references.
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-sm font-semibold text-brand">{PRODUCT_NAME}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{PRODUCT_TAGLINE}</h1>
      <p className="mt-3 text-muted">
        Time in and out with face and location checks, areas with team leaders, leave, sales and payroll. Every rule lives in the database.
      </p>

      <section className="mt-10">
        <h2 className="font-semibold">Try the demo</h2>
        <p className="text-sm text-muted">{DEMO.about} Made-up data, reset every night.</p>
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-card">
          {DEMO.roles.map((r) => (
            <li key={r.key}>
              <Link href={`/demo/${r.key}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas">
                <span className="font-medium">{r.label}</span>
                <span className="text-right text-sm text-muted">{r.sees}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Or sign in as <code>{demoEmail("owner")}</code> (any role above in place of <code>owner</code>), password <code>crewbase-demo</code>.
        </p>
      </section>

      <div className="mt-10 flex gap-3">
        <Link href="/sign-up" className="btn-primary">Create your business</Link>
        <Link href="/sign-in" className="btn-quiet">Sign in</Link>
      </div>
    </main>
  );
}
