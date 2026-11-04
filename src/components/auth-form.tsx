"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/auth-actions";

type Field = { name: string; label: string; type?: string; defaultValue?: string; placeholder?: string; hint?: string };

// A small form wrapper for server actions: shows the action's error or success message.
export function ActionForm({
  action,
  fields,
  submit,
  hidden,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  hidden?: Record<string, string>;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={f.name}>
            {f.label}
          </label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} defaultValue={f.defaultValue} placeholder={f.placeholder} className="field" required />
          {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
        </div>
      ))}
      {children}
      {state?.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="text-sm text-good">{state.ok}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Please wait…" : submit}
      </button>
    </form>
  );
}
