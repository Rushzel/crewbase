"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import type { ActionResult } from "@/app/(app)/actions";

// Setup actions for owners. Each one goes through a database function or a table guarded by
// row-level security; the zod checks are only for clear messages.
const done = (error: { message: string } | null, ok: string, path = "/settings"): ActionResult => {
  revalidatePath(path, "layout");
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
    p_hired_on: f.hired_on || undefined,
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
  if (name.length < 2) return { error: "Enter a name." };
  const { error } = await supabase.from("sites").insert({ org_id: org.id, name, address: String(form.get("address") ?? "") || null });
  return done(error, "Added. Open it to draw its boundary and choose its team.", "/areas");
}

export async function saveGeofence(siteId: string, shape: { kind: "circle"; lat: number; lng: number; radius: number } | { kind: "polygon"; points: [number, number][] }): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error } =
    shape.kind === "circle"
      ? await supabase.rpc("add_circle_geofence", { p_site: siteId, p_lat: shape.lat, p_lng: shape.lng, p_radius_m: Math.round(shape.radius) })
      : await supabase.rpc("add_polygon_geofence", { p_site: siteId, p_points: shape.points });
  return done(error, "Boundary saved.", "/areas");
}

export async function clearGeofences(siteId: string): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error } = await supabase.from("geofences").delete().eq("site_id", siteId);
  return done(error, "Boundary removed.", "/areas");
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

export async function saveArea(siteId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await getContext();
  const p = z.object({ name: z.string().trim().min(2, "Enter a name."), address: z.string().trim().optional(), active: z.string().optional() })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await supabase.from("sites")
    .update({ name: p.data.name, address: p.data.address || null, active: p.data.active === "on" })
    .eq("id", siteId);
  return done(error, "Saved.", "/areas");
}

// Replaces an area's team: who works there and who leads it. Leaders are members too.
export async function saveAreaTeam(siteId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await getContext();
  const members = new Set(form.getAll("member").map(String));
  const leaders = new Set(form.getAll("leader").map(String));
  for (const l of leaders) members.add(l);
  const { data: current, error: readError } = await supabase.from("member_sites").select("membership_id, is_leader").eq("site_id", siteId);
  if (readError) return { error: readError.message };
  const gone = (current ?? []).filter((c) => !members.has(c.membership_id)).map((c) => c.membership_id);
  if (gone.length) {
    const { error } = await supabase.from("member_sites").delete().eq("site_id", siteId).in("membership_id", gone);
    if (error) return { error: error.message };
  }
  const rows = [...members].map((m) => ({ membership_id: m, site_id: siteId, is_leader: leaders.has(m) }))
    .filter((r) => !(current ?? []).some((c) => c.membership_id === r.membership_id && c.is_leader === r.is_leader));
  if (rows.length) {
    // org_id is filled in by the database from the area.
    const { error } = await supabase.from("member_sites").upsert(rows as never, { onConflict: "membership_id,site_id" });
    if (error) return { error: error.message };
  }
  return done(null, `Team saved: ${members.size} ${members.size === 1 ? "person" : "people"}, ${leaders.size} leading.`, "/areas");
}

export async function saveLeaveType(id: string | null, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, org } = await getContext();
  const p = z.object({
    name: z.string().trim().min(2, "Enter a name."),
    yearly_days: z.string().optional(),
    paid: z.string().optional(),
    needs_attachment: z.string().optional(),
    active: z.string().optional(),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const row = {
    name: p.data.name,
    yearly_days: p.data.yearly_days ? Number(p.data.yearly_days) : null,
    paid: p.data.paid === "on",
    needs_attachment: p.data.needs_attachment === "on",
    active: id ? p.data.active === "on" : true,
  };
  const { error } = id
    ? await supabase.from("leave_types").update(row).eq("id", id)
    : await supabase.from("leave_types").insert({ ...row, org_id: org.id });
  return done(error?.code === "23505" ? { message: "There's already a leave type with that name." } : error, "Saved.", "/settings/leave");
}
