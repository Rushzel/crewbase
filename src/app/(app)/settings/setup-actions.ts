"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import type { ActionResult } from "@/app/(app)/actions";

// Setup actions for owners. Each one goes through a database function or a table guarded by
// row-level security; the zod checks are only for clear messages.
const done = (error: { message: string } | null, ok: string, path = "/settings"): ActionResult => {
  revalidatePath(path);
  return error ? { error: error.message } : { ok };
};

export async function inviteMember(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, org } = await getContext();
  const p = z.object({ email: z.email(), name: z.string().trim().min(2), role: z.string().uuid(), manager: z.string().optional() }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const { data, error } = await supabase.rpc("invite_member", {
    p_org: org.id, p_email: p.data.email, p_display_name: p.data.name, p_role: p.data.role,
    p_manager: p.data.manager || undefined,
  });
  if (error) return done(error, "", "/settings/people");
  revalidatePath("/settings/people");
  // Without an email service the link is shown once, for the owner to send.
  return { ok: `Invited. Send them this link (shown once): /invite/${data}` };
}

export async function saveMember(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await getContext();
  const f = Object.fromEntries(form) as Record<string, string>;
  const { error } = await supabase.rpc("save_member", {
    p_member: f.member, p_display_name: f.name, p_role: f.role, p_manager: (f.manager || null) as string,
    p_employment_type: f.employment_type as "regular" | "provisional" | "contract",
    p_status: f.status as "invited" | "active" | "inactive", p_employee_code: f.code || undefined,
  });
  return done(error, "Saved.", "/settings/people");
}

export async function setRate(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, org } = await getContext();
  const p = z.object({ member: z.string().uuid(), basis: z.enum(["hourly", "daily", "monthly"]), amount: z.coerce.number().positive(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await supabase.from("pay_rates").insert({
    org_id: org.id, membership_id: p.data.member, basis: p.data.basis, amount_minor: Math.round(p.data.amount * 100), effective_from: p.data.from,
  });
  return done(error?.code === "23505" ? { message: "There's already a rate starting that day." } : error, "Rate saved.", "/settings/people");
}

export async function addSite(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, org } = await getContext();
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter a site name." };
  const { error } = await supabase.from("sites").insert({ org_id: org.id, name, address: String(form.get("address") ?? "") || null });
  return done(error, "Site added. Now draw its geofence.", "/settings/sites");
}

export async function saveGeofence(siteId: string, shape: { kind: "circle"; lat: number; lng: number; radius: number } | { kind: "polygon"; points: [number, number][] }): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error } =
    shape.kind === "circle"
      ? await supabase.rpc("add_circle_geofence", { p_site: siteId, p_lat: shape.lat, p_lng: shape.lng, p_radius_m: Math.round(shape.radius) })
      : await supabase.rpc("add_polygon_geofence", { p_site: siteId, p_points: shape.points });
  return done(error, "Geofence saved.", "/settings/sites");
}

export async function clearGeofences(siteId: string): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error } = await supabase.from("geofences").delete().eq("site_id", siteId);
  return done(error, "Geofences removed.", "/settings/sites");
}

export async function addDeduction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, org } = await getContext();
  const p = z.object({ name: z.string().trim().min(2), kind: z.enum(["fixed", "percent"]), value: z.coerce.number().min(0) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await supabase.from("deduction_rules").insert({
    org_id: org.id, name: p.data.name, kind: p.data.kind, value: p.data.kind === "fixed" ? Math.round(p.data.value * 100) : p.data.value,
  });
  return done(error, "Deduction added.", "/settings/pay");
}

export async function toggleDeduction(id: string, active: boolean) {
  const { supabase } = await getContext();
  await supabase.from("deduction_rules").update({ active }).eq("id", id);
  revalidatePath("/settings/pay");
}
