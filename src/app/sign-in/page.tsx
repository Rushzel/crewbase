import Link from "next/link";
import { ActionForm } from "@/components/auth-form";
import { signIn } from "@/app/auth-actions";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Link href="/" className="mb-8 text-sm font-semibold">{PRODUCT_NAME}</Link>
      <div className="card">
        <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
        <p className="mb-5 text-sm text-muted">Use your work email.</p>
        {typeof error === "string" && <p className="mb-4 text-sm text-warn">{error}</p>}
        <ActionForm
          action={signIn}
          hidden={{ next: typeof next === "string" ? next : "/today" }}
          fields={[
            { name: "email", label: "Email", type: "email" },
            { name: "password", label: "Password", type: "password" },
          ]}
          submit="Sign in"
        />
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        New business? <Link href="/sign-up" className="text-brand">Create an account</Link> · <Link href="/" className="text-brand">Try the demo</Link>
      </p>
    </main>
  );
}
