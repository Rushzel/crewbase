import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { saveProduct } from "@/app/(app)/sales/actions";
import { PageHeader, Pill } from "@/components/ui";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Products" };

// What agents can sell. Price and incentive are copied onto each application, so changes never rewrite past sales.
export default async function ProductsPage() {
  const { supabase, org, settings, can, has } = await getContext();
  if (!has("sales") || !can("products.manage")) redirect("/home");
  const { data: products } = await supabase.from("products").select("*").eq("org_id", org.id).order("sort").order("name");

  const fields = (p?: NonNullable<typeof products>[number]) => (
    <>
      <div className="min-w-40 flex-1"><label className="label">Name</label><input name="name" defaultValue={p?.name} className="field" required /></div>
      <div className="min-w-48 flex-[2]"><label className="label">Description</label><input name="description" defaultValue={p?.description ?? ""} className="field" /></div>
      <div className="w-32"><label className="label">Price ({settings.currency})</label><input name="price" type="number" min={0} step="0.01" defaultValue={p ? Number(p.price_minor) / 100 : ""} className="field" required /></div>
      <div className="w-32"><label className="label">Incentive per sale</label><input name="incentive" type="number" min={0} step="0.01" defaultValue={p ? Number(p.incentive_minor) / 100 : 0} className="field" required /></div>
      <div className="flex flex-col gap-1 pb-1 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="needs_verification" defaultChecked={p?.needs_verification ?? true} /> Customer confirms by email</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="auto_approve" defaultChecked={p?.auto_approve ?? false} /> Approve automatically once confirmed</label>
        {p && <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={p.active} /> On sale</label>}
      </div>
    </>
  );

  return (
    <>
      <PageHeader title="Products" subtitle="What your team sells, and the incentive each approved sale adds to the seller's payslip." />
      <section className="card space-y-4">
        {(products ?? []).map((p) => (
          <div key={p.id} className="border-b border-line pb-4">
            <p className="mb-2 text-sm font-medium">
              {p.name} · {formatMoney(Number(p.price_minor), settings.currency)}{" "}
              {!p.active && <Pill>Not on sale</Pill>} {p.auto_approve && <Pill tone="info">Auto-approved</Pill>}
            </p>
            <Form action={saveProduct.bind(null, p.id)} className="flex flex-wrap items-end gap-3">
              {fields(p)}
              <button className="btn-quiet">Save</button>
            </Form>
          </div>
        ))}
        <div>
          <h2 className="mb-2 font-semibold">Add a product</h2>
          <Form action={saveProduct.bind(null, null)} className="flex flex-wrap items-end gap-3">
            {fields()}
            <button className="btn-primary">Add</button>
          </Form>
        </div>
        <p className="text-xs text-muted">Automatic approval only happens after the customer confirms, so it needs email confirmation switched on.</p>
      </section>
    </>
  );
}
