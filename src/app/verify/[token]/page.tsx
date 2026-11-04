import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata = { title: "Confirm your application" };

async function confirm(token: string) {
  "use server";
  // Callable without signing in: the token is the only key, works once and expires.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_application", { p_token: token });
  if (error) redirect(`/verify/${token}?result=invalid`);
  const r = data as { status: string; business: string; product: string };
  redirect(`/verify/${token}?result=${r.status}&business=${encodeURIComponent(r.business)}&product=${encodeURIComponent(r.product)}`);
}

// The customer opens the link from their email. Confirming needs a button press, because email
// security scanners open links on their own and would otherwise confirm sales nobody agreed to.
export default async function VerifyPage({ params, searchParams }: PageProps<"/verify/[token]">) {
  const { token } = await params;
  const { result, business, product } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="card text-center">
        {result === "invalid" ? (
          <>
            <h1 className="text-xl font-semibold">This link doesn&apos;t work</h1>
            <p className="mt-2 text-sm text-muted">It may have been used already or expired. Ask the person who helped you for a new one.</p>
          </>
        ) : result ? (
          <>
            <h1 className="text-xl font-semibold">Thank you</h1>
            <p className="mt-2 text-sm text-muted">
              Your application for {typeof product === "string" ? product : "the product"} with {typeof business === "string" ? business : "us"} is confirmed.
              {result === "approved" ? " It has been approved." : " The team will review it and get in touch."}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Confirm your application</h1>
            <p className="mt-2 text-sm text-muted">Press the button to confirm that you applied. If you didn&apos;t, close this page.</p>
            <form action={confirm.bind(null, token)} className="mt-4">
              <button className="btn-primary w-full">Yes, I applied</button>
            </form>
          </>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-muted">Powered by {PRODUCT_NAME}.</p>
    </main>
  );
}
