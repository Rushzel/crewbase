"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import type { ActionResult } from "@/app/(app)/actions";

// The database decides: allowance, overlaps, who may review and locked pay periods are all checked there.
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];

export async function requestLeave(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, org, me } = await getContext();
  const p = z.object({
    type: z.string().uuid("Choose a leave type"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first day"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last day"),
    reason: z.string().trim().max(500).optional(),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };

  let path: string | undefined;
  const file = form.get("attachment");
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED.includes(file.type)) return { error: "Attach a JPG, PNG or PDF." };
    if (file.size > 5 * 1024 * 1024) return { error: "Attachments can be up to 5 MB." };
    // Stored in the person's own folder; storage policies refuse any other folder.
    path = `${org.id}/${me.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_").slice(-60)}`;
    const { error } = await supabase.storage.from("leave-attachments").upload(path, file, { contentType: file.type });
    if (error) return { error: `Upload failed: ${error.message}` };
  }

  const { error } = await supabase.rpc("request_leave", {
    p_org: org.id, p_type: p.data.type, p_from: p.data.from, p_to: p.data.to,
    p_reason: p.data.reason || undefined, p_attachment: path,
  });
  if (error && path) await supabase.storage.from("leave-attachments").remove([path]);
  revalidatePath("/leave");
  return error ? { error: error.message } : { ok: "Leave requested. You'll see the decision here." };
}

export async function withdrawLeave(id: string) {
  const { supabase } = await getContext();
  await supabase.rpc("withdraw_leave", { p_request: id });
  revalidatePath("/leave");
}

export async function reviewLeave(id: string, approve: boolean, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await getContext();
  const note = String(form.get("note") ?? "").trim();
  const { error } = await supabase.rpc("review_leave", { p_request: id, p_approve: approve, p_note: note || undefined });
  revalidatePath("/leave");
  revalidatePath("/home");
  return error ? { error: error.message } : { ok: approve ? "Approved." : "Rejected." };
}
