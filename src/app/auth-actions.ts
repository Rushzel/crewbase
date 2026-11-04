"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/context";

export type FormState = { error?: string; ok?: string } | undefined;

const credentials = z.object({ email: z.email(), password: z.string().min(8, "Use at least 8 characters") });

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "That email and password don't match." };
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/home");
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) return { error: error.message };
  if (!data.session) return { ok: "Check your email to confirm your account, then sign in." };
  redirect("/onboarding");
}

const business = z.object({
  name: z.string().trim().min(2, "Enter the business name").max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "Use 3 to 40 lowercase letters, numbers or dashes"),
  displayName: z.string().trim().min(2, "Enter your name").max(80),
  timezone: z.string().min(3),
  currency: z.string().length(3),
  template: z.enum(["small", "field"]).default("small"),
});

export async function createBusiness(_: FormState, form: FormData): Promise<FormState> {
  const parsed = business.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_display_name: parsed.data.displayName,
    p_timezone: parsed.data.timezone,
    p_currency: parsed.data.currency,
    p_template: parsed.data.template,
  });
  if (error) return { error: error.code === "23505" ? "That web address is taken." : error.message };
  (await cookies()).set(ORG_COOKIE, data, { path: "/", sameSite: "lax", httpOnly: true });
  redirect("/home");
}

export async function switchBusiness(orgId: string) {
  (await cookies()).set(ORG_COOKIE, orgId, { path: "/", sameSite: "lax", httpOnly: true });
  redirect("/home");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ORG_COOKIE);
  redirect("/");
}
