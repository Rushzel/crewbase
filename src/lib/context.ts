import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Permission = Database["public"]["Enums"]["app_permission"];
export type Feature = Database["public"]["Enums"]["feature_key"];
export const ORG_COOKIE = "crewbase-org";

// The signed-in person, their businesses and the current one. Cached per request.
// Used to shape the interface only: the database re-checks every permission on every call.
export const getContext = cache(async () => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/sign-in");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, org_id, display_name, manager_id, employment_type, organizations(id, name, slug, brand_color, is_demo), roles(name, scope, is_owner, role_permissions(permission))")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at");

  if (!memberships || memberships.length === 0) redirect("/onboarding");

  const chosen = (await cookies()).get(ORG_COOKIE)?.value;
  const me = memberships.find((m) => m.org_id === chosen) ?? memberships[0];
  const orgId = me.org_id;

  const [{ data: settings }, { data: features }, { data: sites }] = await Promise.all([
    supabase.from("org_settings").select("*").eq("org_id", orgId).single(),
    supabase.from("org_features").select("feature, enabled").eq("org_id", orgId),
    supabase.from("sites").select("id, name, active").eq("org_id", orgId).order("name"),
  ]);

  const permissions = new Set<Permission>((me.roles?.role_permissions ?? []).map((p) => p.permission));
  const enabled = new Set<Feature>((features ?? []).filter((f) => f.enabled).map((f) => f.feature));

  return {
    supabase,
    userId,
    me,
    org: me.organizations!,
    role: me.roles!,
    memberships,
    settings: settings!,
    sites: sites ?? [],
    can: (p: Permission) => permissions.has(p),
    has: (f: Feature) => enabled.has(f),
  };
});

export type AppContext = Awaited<ReturnType<typeof getContext>>;
