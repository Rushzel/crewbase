"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/app/(app)/actions";

// Wraps a server action form and shows its result message.
export function Form({
  action,
  children,
  className = "space-y-3",
}: {
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state?.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-good">{state.ok}</p>}
    </form>
  );
}
