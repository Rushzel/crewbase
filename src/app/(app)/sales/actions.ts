"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { appUrl, sendMail } from "@/lib/mail";
import type { ActionResult } from "@/app/(app)/actions";

// Prices, incentives, statuses and who may approve are all decided by the database functions.

async function emailLink(to: string, business: string, token: string): Promise<{ sent: boolean; link: string }> {
  const link = appUrl(`/verify/${token}`);
  const sent = await sendMail(
    to,
    `Please confirm your application with ${business}`,
    `Hello,\n\nThank you for your interest. Please confirm your application here:\n\n${link}\n\nThe link works once and expires in 7 days. If you didn't apply, you can ignore this email.\n\n${business}`,
  );
  return { sent, link };
}

export type SaleResult = { error?: string; ok?: string; link?: string } | undefined;

export async function logSale(_: SaleResult, form: FormData): Promise<SaleResult> {
  const { supabase, org } = await getContext();
  const p = z.object({
    product: z.string().uuid("Choose a product"),
    name: z.string().trim().min(2, "Enter the customer's name"),
    email: z.email("Enter the customer's email"),
    phone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(1000).optional(),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const { data, error } = await supabase.rpc("log_application", {
    p_org: org.id, p_product: p.data.product, p_customer_name: p.data.name, p_customer_email: p.data.email,
    p_customer_phone: p.data.phone || undefined, p_address: p.data.address || undefined, p_notes: p.data.notes || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/sales");
  const token = (data as { token?: string | null })?.token;
  if (!token) return { ok: "Logged. It's ready for approval." };
  const { sent, link } = await emailLink(p.data.email, org.name, token);
  return {
    ok: sent ? `Logged. A confirmation link was emailed to ${p.data.email}.` : "Logged. No mail server is set up, so share this confirmation link with the customer:",
    link: org.is_demo || !sent ? link : undefined,
  };
}

export async function resendLink(id: string): Promise<SaleResult> {
  const { supabase, org } = await getContext();
  const { data: token, error } = await supabase.rpc("resend_verification", { p_application: id });
  if (error) return { error: error.message };
  const { data: app } = await supabase.from("customer_applications").select("customer_email").eq("id", id).single();
  revalidatePath("/sales");
  const { sent, link } = await emailLink(app!.customer_email, org.name, token);
  return { ok: sent ? `New link emailed to ${app!.customer_email}.` : "New link (no mail server set up):", link: org.is_demo || !sent ? link : undefined };
}

// Corrects the customer's details before a decision. A new email address needs a new confirmation.
export async function updateSale(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, org } = await getContext();
  const p = z.object({
    name: z.string().trim().min(2, "Enter the customer's name"),
    email: z.email("Enter the customer's email"),
    phone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(1000).optional(),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const { data: token, error } = await supabase.rpc("update_application", {
    p_application: id, p_customer_name: p.data.name, p_customer_email: p.data.email,
    p_customer_phone: p.data.phone || undefined, p_address: p.data.address || undefined, p_notes: p.data.notes || undefined,
  });
  revalidatePath("/sales");
  if (error) return { error: error.message };
  if (!token) return { ok: "Saved." };
  const { sent, link } = await emailLink(p.data.email, org.name, token);
  return { ok: sent && !org.is_demo ? `Saved. A new confirmation link was emailed to ${p.data.email}.` : `Saved. The new email needs a new confirmation: ${link}` };
}

export async function cancelSale(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error } = await supabase.rpc("cancel_application", { p_application: id, p_reason: String(form.get("reason") ?? "") });
  revalidatePath("/sales");
  return error ? { error: error.message } : { ok: "Cancelled." };
}

export async function decideSale(id: string, approve: boolean, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await getContext();
  const note = String(form.get("note") ?? "").trim();
  const { error } = await supabase.rpc("decide_application", { p_application: id, p_approve: approve, p_note: note || undefined });
  revalidatePath("/sales");
  revalidatePath("/home");
  return error ? { error: error.message } : { ok: approve ? "Approved." : "Rejected." };
}

export async function saveProduct(id: string | null, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, org } = await getContext();
  const p = z.object({
    name: z.string().trim().min(2, "Enter a name"),
    description: z.string().trim().max(500).optional(),
    price: z.coerce.number().min(0, "Price can't be negative"),
    incentive: z.coerce.number().min(0, "Incentive can't be negative"),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const verify = form.get("needs_verification") === "on";
  const row = {
    name: p.data.name, description: p.data.description || null,
    price_minor: Math.round(p.data.price * 100), incentive_minor: Math.round(p.data.incentive * 100),
    needs_verification: verify, auto_approve: verify && form.get("auto_approve") === "on",
    active: id ? form.get("active") === "on" : true,
  };
  const { error } = id
    ? await supabase.from("products").update(row).eq("id", id)
    : await supabase.from("products").insert({ ...row, org_id: org.id });
  revalidatePath("/products");
  if (error) return { error: error.code === "23505" ? "There's already a product with that name." : error.message };
  return { ok: "Saved. Prices and incentives already on applications don't change." };
}
