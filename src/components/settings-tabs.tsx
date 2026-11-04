import { NavLink } from "@/components/nav-link";

export function SettingsTabs() {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto" aria-label="Settings sections">
      <NavLink href="/settings/general">General</NavLink>
      <NavLink href="/settings/roles">Roles</NavLink>
      <NavLink href="/settings/people">Accounts and pay</NavLink>
      <NavLink href="/settings/leave">Leave types</NavLink>
      <NavLink href="/settings/pay">Deductions</NavLink>
    </nav>
  );
}
