import Link from "next/link";
import { ActionForm } from "@/components/auth-form";
import { signUp } from "@/app/auth-actions";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Link href="/" className="mb-8 text-sm font-semibold">{PRODUCT_NAME}</Link>
      <div className="card">
        <h1 className="mb-1 text-xl font-semibold">Create an account</h1>
        <p className="mb-5 text-sm text-muted">Then set up your business: sites, roles, pay rules and branding.</p>
        <ActionForm
          action={signUp}
          fields={[
            { name: "email", label: "Email", type: "email" },
            { name: "password", label: "Password", type: "password", hint: "At least 8 characters." },
          ]}
          submit="Create account"
        />
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Already have one? <Link href="/sign-in" className="text-brand">Sign in</Link>
      </p>
    </main>
  );
}
