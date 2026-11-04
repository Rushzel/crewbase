"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { contrastRatio } from "@/lib/format";

// Every action calls a database function or a table protected by row-level security.
// The checks here are for friendly messages; the database is what actually enforces the rules.
export type ActionResult = { error?: string; ok?: string } | undefined;

const fail = (e: { message: string } | null): ActionResult => (e ? { error: e.message } : undefined);

// Local date and time in the business timezone, as typed into a form, to an ISO timestamp.
function localToIso(date: string, time: string, timeZone: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(guess)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  return new Date(guess.getTime() - (asLocal - guess.getTime())).toISOString();
}

const requestSchema = z.object({
  kind: z.enum(["change_times", "missing_time_out", "missing_entry", "delete_entry"]),
  entry: z.string().uuid().optional().or(z.literal("")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeIn: z.string().optional(),
  timeOut: z.string().optional(),
  breakMinutes: z.coerce.number().int().min(0).max(600).optional(),
  site: z.string().uuid().optional().or(z.literal("")),
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters"),
  evidence: z.url().optional().or(z.literal("")),
});

export async function submitRequest(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, settings, org } = await getContext();
  const parsed = requestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = parsed.data;
  const tz = settings.timezone;
  const { error } = await supabase.rpc("submit_request", {
    p_kind: r.kind,
    // A missing day has no entry; the generated types don't know the function accepts null here.
    p_entry: (r.entry || null) as string,
    p_reason: r.reason,
    p_requested_in: r.timeIn ? localToIso(r.date, r.timeIn, tz) : undefined,
    p_requested_out: r.timeOut ? localToIso(r.timeOut < (r.timeIn ?? "") ? nextDay(r.date) : r.date, r.timeOut, tz) : undefined,
    p_requested_break: r.breakMinutes,
    p_site: r.site || undefined,
    p_evidence_link: r.evidence || undefined,
    p_org: org.id,
  });
  revalidatePath("/history");
  revalidatePath("/requests");
  return fail(error) ?? { ok: "Request sent to your manager." };
}

const nextDay = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

const editSchema = z.object({
  entry: z.string().uuid(),
  date: z.string(),
  timeIn: z.string().min(4),
  timeOut: z.string().min(4),
  breakMinutes: z.coerce.number().int().min(0),
  reason: z.string().trim().min(3, "A reason is required"),
});

export async function editEntry(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, settings } = await getContext();
  const parsed = editSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const e = parsed.data;
  const { error } = await supabase.rpc("admin_edit_entry", {
    p_entry: e.entry,
    p_in: localToIso(e.date, e.timeIn, settings.timezone),
    p_out: localToIso(e.timeOut < e.timeIn ? nextDay(e.date) : e.date, e.timeOut, settings.timezone),
    p_break: e.breakMinutes,
    p_reason: e.reason,
  });
  revalidatePath("/history");
  return fail(error) ?? { ok: "Saved and logged." };
}

export async function deleteEntry(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await getContext();
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { error: "A reason is required" };
  const { error } = await supabase.rpc("admin_delete_entry", { p_entry: String(form.get("entry")), p_reason: reason });
  revalidatePath("/history");
  return fail(error) ?? { ok: "Deleted and logged." };
}

export async function decideRequest(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await getContext();
  const id = String(form.get("request"));
  const note = String(form.get("note") ?? "").trim();
  const decision = String(form.get("decision"));
  const { error } =
    decision === "approve"
      ? await supabase.rpc("approve_request", { p_request: id, p_note: note || undefined })
      : decision === "reject"
        ? await supabase.rpc("reject_request", { p_request: id, p_note: note })
        : await supabase.rpc("withdraw_request", { p_request: id });
  revalidatePath("/requests");
  revalidatePath("/history");
  return fail(error) ?? { ok: decision === "approve" ? "Approved and applied." : decision === "reject" ? "Rejected." : "Withdrawn." };
}

export async function payrollStep(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, org } = await getContext();
  const step = String(form.get("step"));
  const period = String(form.get("period") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  let error: { message: string } | null = null;
  if (step === "create") {
    ({ error } = await supabase.rpc("create_pay_period", { p_org: org.id, p_starts: String(form.get("starts")), p_ends: String(form.get("ends")) }));
  } else if (step === "review") {
    ({ error } = await supabase.rpc("start_review", { p_period: period }));
  } else if (step === "approve_all") {
    const ids = form.getAll("member").map(String);
    for (const m of ids) {
      ({ error } = await supabase.rpc("approve_timesheet", { p_period: period, p_member: m }));
      if (error) break;
    }
  } else if (step === "lock") {
    ({ error } = await supabase.rpc("lock_period", { p_period: period, p_override_reason: reason || undefined }));
  } else if (step === "unlock") {
    ({ error } = await supabase.rpc("unlock_period", { p_period: period, p_reason: reason }));
  } else if (step === "generate") {
    ({ error } = await supabase.rpc("generate_payslips", { p_period: period }));
  } else if (step === "finalize") {
    ({ error } = await supabase.rpc("finalize_period", { p_period: period }));
  } else if (step === "void") {
    ({ error } = await supabase.rpc("void_payslip", { p_payslip: String(form.get("payslip")), p_reason: reason }));
  }
  revalidatePath("/payroll");
  return fail(error) ?? { ok: "Done." };
}

export async function saveBranding(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, org } = await getContext();
  const name = String(form.get("name") ?? "").trim();
  const color = String(form.get("brand_color") ?? "").toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) return { error: "Choose a colour." };
  if (contrastRatio(color, "#ffffff") < 3) return { error: "That colour is too light to read on white. Pick a darker one." };
  const { error, count } = await supabase.from("organizations").update({ name, brand_color: color }, { count: "exact" }).eq("id", org.id);
  revalidatePath("/", "layout");
  if (!error && count === 0) return { error: "You don't have permission to change branding." };
  return fail(error) ?? { ok: "Branding saved." };
}

export async function saveSettings(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, org } = await getContext();
  const n = (k: string) => Number(form.get(k));
  const { error, count } = await supabase
    .from("org_settings")
    .update(
      {
        timezone: String(form.get("timezone")),
        default_start_time: String(form.get("default_start_time")),
        grace_minutes: n("grace_minutes"),
        absent_after_minutes: n("absent_after_minutes"),
        full_day_minutes: Math.round(n("full_day_hours") * 60),
        half_day_minutes: Math.round(n("half_day_hours") * 60),
        earliest_clock_in: String(form.get("earliest_clock_in") ?? "") || null,
        work_days: form.getAll("work_days").map(Number),
        probation_months: n("probation_months"),
        follow_up_hours: n("follow_up_hours"),
        area_label: String(form.get("area_label") ?? "").trim() || "Area",
        area_label_plural: String(form.get("area_label_plural") ?? "").trim() || "Areas",
        regular_minutes_per_day: n("regular_hours") * 60,
        overtime_multiplier: n("overtime_multiplier"),
        location_max_accuracy_m: n("location_max_accuracy_m"),
        location_mode: String(form.get("location_mode")) as "strict" | "balanced",
        location_fail_policy: String(form.get("location_fail_policy")) as "block" | "flag",
        face_fail_policy: String(form.get("face_fail_policy")) as "block" | "flag",
        face_threshold: n("face_threshold"),
        liveness_required: form.get("liveness_required") === "on",
      },
      { count: "exact" },
    )
    .eq("org_id", org.id);
  revalidatePath("/", "layout");
  if (!error && count === 0) return { error: "You don't have permission to change settings." };
  return fail(error) ?? { ok: "Settings saved." };
}

export async function toggleFeature(feature: string, enabled: boolean) {
  const { supabase, org } = await getContext();
  await supabase.from("org_features").update({ enabled }).eq("org_id", org.id).eq("feature", feature as never);
  revalidatePath("/", "layout");
}
