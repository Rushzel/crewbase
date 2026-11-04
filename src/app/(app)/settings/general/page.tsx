import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Form } from "@/components/form";
import { saveBranding, saveSettings, toggleFeature } from "@/app/(app)/actions";
import { PageHeader, Pill } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";

export const metadata = { title: "Settings" };

const FEATURES: { key: string; label: string; about: string }[] = [
  { key: "time_tracking", label: "Time tracking", about: "Time in, breaks and time out" },
  { key: "geofence", label: "Location check", about: "Check each punch against the area's boundary" },
  { key: "face_verification", label: "Face check", about: "Face match with a liveness challenge" },
  { key: "breaks", label: "Breaks", about: "Break and continue buttons" },
  { key: "corrections", label: "Correction requests", about: "People ask for fixes; managers approve" },
  { key: "scheduling", label: "Scheduling", about: "Shifts, lateness and absences" },
  { key: "payroll", label: "Payroll", about: "Pay periods and payslips" },
  { key: "analytics", label: "Analytics", about: "Attendance, punctuality, hours and forecasts" },
  { key: "leave", label: "Leave", about: "Leave requests with yearly allowances and approval" },
  { key: "sales", label: "Sales", about: "Products, customer applications, confirmation links and incentives" },
  { key: "output_tracking", label: "Output tracking", about: "A count you define, such as orders packed" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SettingsPage() {
  const { supabase, org, settings, can, has } = await getContext();
  if (!can("settings.manage")) redirect("/home");
  const { data: roles } = await supabase.from("roles").select("id, name, scope, is_owner, role_permissions(permission)").eq("org_id", org.id).order("is_owner", { ascending: false });

  return (
    <>
      <PageHeader title="Settings" subtitle="Changes are recorded in the audit log." />
      <SettingsTabs />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Branding</h2>
          <Form action={saveBranding}>
            <div><label className="label">Business name</label><input name="name" className="field" defaultValue={org.name} /></div>
            <div><label className="label">Accent colour</label><input type="color" name="brand_color" defaultValue={org.brand_color} className="h-10 w-20 rounded-lg border border-line" /></div>
            <p className="text-xs text-muted">Colours too light to read on white are rejected.</p>
            <button className="btn-primary">Save branding</button>
          </Form>
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Features</h2>
          <ul className="divide-y divide-line">
            {FEATURES.map((f) => {
              const on = has(f.key as never);
              return (
                <li key={f.key} className="flex items-center justify-between gap-3 py-2">
                  <div><p className="text-sm font-medium">{f.label}</p><p className="text-xs text-muted">{f.about}</p></div>
                  <form action={toggleFeature.bind(null, f.key, !on)}>
                    <button className={on ? "btn-primary" : "btn-quiet"} aria-pressed={on}>{on ? "On" : "Off"}</button>
                  </form>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">Switching a feature off hides it and makes the database refuse its actions.</p>
        </section>

        <section className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">Time and checks</h2>
          <Form action={saveSettings} className="grid gap-3 sm:grid-cols-3">
            <div><label className="label">Timezone</label><input name="timezone" className="field" defaultValue={settings.timezone} /></div>
            <div><label className="label">Regular hours a day</label><input type="number" name="regular_hours" step="0.5" className="field" defaultValue={settings.regular_minutes_per_day / 60} /></div>
            <div><label className="label">Overtime multiplier</label><input type="number" name="overtime_multiplier" step="0.05" className="field" defaultValue={settings.overtime_multiplier} /></div>
            <div><label className="label">Start of the day (when there&apos;s no shift)</label><input type="time" name="default_start_time" className="field" defaultValue={settings.default_start_time.slice(0, 5)} /></div>
            <div><label className="label">Grace minutes before late</label><input type="number" name="grace_minutes" className="field" defaultValue={settings.grace_minutes} /></div>
            <div><label className="label">Absent if in this many minutes late</label><input type="number" name="absent_after_minutes" className="field" defaultValue={settings.absent_after_minutes} /></div>
            <div><label className="label">Full day: at least (hours)</label><input type="number" name="full_day_hours" step="0.25" className="field" defaultValue={settings.full_day_minutes / 60} /></div>
            <div><label className="label">Half day: at least (hours)</label><input type="number" name="half_day_hours" step="0.25" className="field" defaultValue={settings.half_day_minutes / 60} /></div>
            <div><label className="label">Earliest time in (blank for any time)</label><input type="time" name="earliest_clock_in" className="field" defaultValue={settings.earliest_clock_in?.slice(0, 5) ?? ""} /></div>
            <fieldset className="sm:col-span-3">
              <legend className="label">Working days (used when someone has no shifts that week)</legend>
              <div className="flex flex-wrap gap-3 text-sm">
                {DAYS.map((d, i) => (
                  <label key={d} className="flex items-center gap-1"><input type="checkbox" name="work_days" value={i} defaultChecked={settings.work_days.includes(i)} /> {d}</label>
                ))}
              </div>
            </fieldset>
            <div><label className="label">Location accuracy limit (m)</label><input type="number" name="location_max_accuracy_m" className="field" defaultValue={settings.location_max_accuracy_m} /></div>
            <div><label className="label">Edge rule</label>
              <select name="location_mode" className="field" defaultValue={settings.location_mode}>
                <option value="balanced">Balanced: allow readings near the edge</option>
                <option value="strict">Strict: whole accuracy circle inside</option>
              </select>
            </div>
            <div><label className="label">When the location check fails</label>
              <select name="location_fail_policy" className="field" defaultValue={settings.location_fail_policy}>
                <option value="flag">Accept and flag for review</option><option value="block">Block the punch</option>
              </select>
            </div>
            <div><label className="label">When the face check fails</label>
              <select name="face_fail_policy" className="field" defaultValue={settings.face_fail_policy}>
                <option value="block">Block the punch</option><option value="flag">Accept and flag for review</option>
              </select>
            </div>
            <div><label className="label">Face match threshold (0.30 to 0.99)</label><input type="number" name="face_threshold" step="0.01" min="0.3" max="0.99" className="field" defaultValue={settings.face_threshold} /></div>
            <div><label className="label">Probation (months before provisional staff become regular)</label><input type="number" name="probation_months" min="0" max="36" className="field" defaultValue={settings.probation_months} /></div>
            <div><label className="label">Sales: follow up unconfirmed after (hours)</label><input type="number" name="follow_up_hours" min="1" max="720" className="field" defaultValue={settings.follow_up_hours} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Name for a work location</label><input name="area_label" className="field" defaultValue={settings.area_label} /></div>
              <div><label className="label">Plural</label><input name="area_label_plural" className="field" defaultValue={settings.area_label_plural} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="liveness_required" defaultChecked={settings.liveness_required} /> Require the liveness challenge</label>
            <button className="btn-primary sm:col-span-3 sm:justify-self-start">Save settings</button>
          </Form>
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Roles</h2>
          <ul className="space-y-3">
            {(roles ?? []).map((r) => (
              <li key={r.id}>
                <p className="text-sm font-medium">{r.name} {r.is_owner && <Pill tone="info">Owner</Pill>} <Pill>Sees {r.scope === "all" ? "everyone" : r.scope === "team" ? "their team" : "only themself"}</Pill></p>
                <p className="mt-1 text-xs text-muted">{(r.role_permissions ?? []).map((p) => p.permission).join(", ")}</p>
              </li>
            ))}
          </ul>
        </section>

      </div>
    </>
  );
}
