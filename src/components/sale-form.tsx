"use client";

import { useActionState, useState, useTransition } from "react";
import { logSale, resendLink, type SaleResult } from "@/app/(app)/sales/actions";

type Product = { id: string; name: string; price: string; needs_verification: boolean };

function LinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl bg-canvas p-2">
      <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
      <button type="button" className="text-xs text-brand" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Result({ state }: { state: SaleResult }) {
  if (!state) return null;
  return (
    <div className="text-sm">
      {state.error && <p role="alert" className="text-bad">{state.error}</p>}
      {state.ok && <p role="status" className="text-good">{state.ok}</p>}
      {state.link && <LinkBox link={state.link} />}
    </div>
  );
}

export function SaleForm({ products }: { products: Product[] }) {
  const [state, action, pending] = useActionState(logSale, undefined);
  return (
    <form action={action} className="space-y-3">
      <fieldset disabled={pending} className="contents">
        <div>
          <label className="label" htmlFor="product">Product</label>
          <select id="product" name="product" className="field" required>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.price}{p.needs_verification ? "" : " · no confirmation needed"}</option>
            ))}
          </select>
        </div>
        <div><label className="label" htmlFor="name">Customer name</label><input id="name" name="name" className="field" required /></div>
        <div><label className="label" htmlFor="email">Customer email</label><input id="email" name="email" type="email" className="field" required /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label" htmlFor="phone">Phone</label><input id="phone" name="phone" className="field" /></div>
          <div><label className="label" htmlFor="address">Address</label><input id="address" name="address" className="field" /></div>
        </div>
        <div><label className="label" htmlFor="notes">Notes</label><input id="notes" name="notes" className="field" /></div>
        <button className="btn-primary">Log sale</button>
      </fieldset>
      <Result state={state} />
    </form>
  );
}

export function ResendButton({ id }: { id: string }) {
  const [state, setState] = useState<SaleResult>(undefined);
  const [pending, start] = useTransition();
  return (
    <div>
      <button className="text-sm text-brand disabled:opacity-50" disabled={pending} onClick={() => start(async () => setState(await resendLink(id)))}>
        Send new link
      </button>
      <Result state={state} />
    </div>
  );
}
