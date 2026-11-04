import Link from "next/link";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { DEMOS } from "@/lib/demo";


export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-16">
      <p className="text-sm font-semibold text-brand">{PRODUCT_NAME}</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">{PRODUCT_TAGLINE}</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Any business can sign up and set its own branding, areas, roles, pay rules and features. Time in and out is
        checked against each area&apos;s boundary and a face check with liveness, using the server&apos;s clock. Team
        leaders see their areas, leave and sales go through approval, and approved hours and incentives become payslips.
        Every rule lives in the database, so it holds even if someone bypasses the app.
      </p>

      <h2 className="mt-12 text-lg font-semibold">Try the demo</h2>
      <p className="text-sm text-muted">Made-up businesses and people. The data resets every night.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {DEMOS.map((d) => (
          <div key={d.key} className="card" style={{ borderTop: `4px solid ${d.color}` }}>
            <h3 className="font-semibold">{d.name}</h3>
            <p className="mt-1 text-sm text-muted">{d.about}</p>
            <div className="mt-4 space-y-2">
              {d.roles.map((r) => (
                <Link key={r.key} href={`/demo/${d.key}/${r.key}`} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm hover:bg-canvas">
                  <span className="font-medium">Try as {r.label.toLowerCase()}</span>
                  <span className="text-xs text-muted">{r.sees}</span>
                </Link>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Or sign in as <code>{d.roles[0].key}.{d.key}@crewbase.example</code> (or any role key above in place of <code>{d.roles[0].key}</code>), password <code>crewbase-demo</code>.
            </p>
          </div>
        ))}
      </div>

      <div className="mt-10 flex gap-3">
        <Link href="/sign-up" className="btn-primary">Create your business</Link>
        <Link href="/sign-in" className="btn-quiet">Sign in</Link>
      </div>
    </main>
  );
}
