import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/context";
import { findDemo } from "@/lib/demo";

// One-click demo sign-in for portfolio visitors. The password is read on the server only.
export async function GET(request: NextRequest, ctx: RouteContext<"/demo/[business]/[role]">) {
  const { business, role } = await ctx.params;
  const found = findDemo(business, role);
  if (!found) return NextResponse.redirect(new URL("/", request.url));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: `${role}.${business}@crewbase.example`,
    password: process.env.DEMO_PASSWORD ?? "crewbase-demo",
  });
  if (error) {
    return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent("The demo is waking up. Try again in a minute.")}`, request.url));
  }
  const { data: org } = await supabase.from("organizations").select("id").eq("slug", found.demo.slug).single();
  const response = NextResponse.redirect(new URL("/home?demo=1", request.url));
  if (org) response.cookies.set(ORG_COOKIE, org.id, { path: "/", sameSite: "lax", httpOnly: true });
  return response;
}
