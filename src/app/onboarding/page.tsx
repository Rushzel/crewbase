import { ActionForm } from "@/components/auth-form";
import { createBusiness } from "@/app/auth-actions";

export const metadata = { title: "Set up your business" };

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="card">
        <h1 className="mb-1 text-xl font-semibold">Set up your business</h1>
        <p className="mb-5 text-sm text-muted">
          You&apos;ll be the owner. Your business&apos;s data is kept separate from every other business by the database itself.
        </p>
        <ActionForm
          action={createBusiness}
          fields={[
            { name: "name", label: "Business name", placeholder: "Sample Bakery" },
            { name: "slug", label: "Short web name", placeholder: "sample-bakery", hint: "Lowercase letters, numbers and dashes." },
            { name: "displayName", label: "Your name" },
            { name: "timezone", label: "Timezone", defaultValue: "Asia/Manila" },
            { name: "currency", label: "Currency", defaultValue: "PHP" },
          ]}
          submit="Create business"
        >
          <fieldset>
            <legend className="label">Start with</legend>
            <label className="mb-2 flex gap-2 rounded-xl border border-line p-3 text-sm">
              <input type="radio" name="template" value="small" defaultChecked className="mt-1" />
              <span><span className="font-medium">A small team</span><span className="block text-muted">Owner, managers and employees. Good for a shop, café or office.</span></span>
            </label>
            <label className="flex gap-2 rounded-xl border border-line p-3 text-sm">
              <input type="radio" name="template" value="field" className="mt-1" />
              <span><span className="font-medium">Field teams</span><span className="block text-muted">Finance, Human Resources, Leaders who lead areas, and Employees. Sales and incentives switched on.</span></span>
            </label>
            <p className="mt-1 text-xs text-muted">You can rename roles, change permissions and switch features on or off later.</p>
          </fieldset>
        </ActionForm>
      </div>
    </main>
  );
}
