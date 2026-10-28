import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/context";

export const metadata = { title: "Accept invitation" };

async function accept(token: string) {
  "use server";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) redirect(`/invite/${token}?error=${encodeURIComponent(error.message)}`);
  (await cookies()).set(ORG_COOKIE, data, { path: "/", sameSite: "lax", httpOnly: true });
  redirect("/today");
}

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="card">
        <h1 className="mb-2 text-xl font-semibold">You&apos;re invited</h1>
        {typeof error === "string" && <p className="mb-3 text-sm text-bad">{error}</p>}
        {signedIn ? (
          <form action={accept.bind(null, token)}>
            <p className="mb-4 text-sm text-muted">Join the business with the account you&apos;re signed in with. It must use the email the invitation was sent to.</p>
            <button className="btn-primary w-full">Accept invitation</button>
          </form>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">Sign in, or create an account with the email the invitation was sent to, then come back to this link.</p>
            <div className="flex gap-2">
              <Link className="btn-primary flex-1" href={`/sign-in?next=/invite/${token}`}>Sign in</Link>
              <Link className="btn-quiet flex-1" href="/sign-up">Create account</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
