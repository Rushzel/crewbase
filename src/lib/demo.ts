// The demo business and its one-click sign-ins. The business and every person in it are made up.
// Each role signs in as `${role}@demo.crewbase.example`; the password is read on the server only.
export const DEMO = {
  slug: "demo-company",
  name: "Demo Company",
  about: "Field agents selling packages in three areas, with team leaders, face check with liveness, leave, sales and payroll.",
  roles: [
    { key: "owner", label: "Owner", sees: "Everything" },
    { key: "general-manager", label: "General manager", sees: "The whole business, payroll and approvals" },
    { key: "hr", label: "HR manager", sees: "Accounts, leave, payroll and the audit trail" },
    { key: "operations", label: "Operations manager", sees: "Areas, teams, attendance and sales approvals" },
    { key: "team-leader", label: "Team leader", sees: "Their area's agents, rankings and face enrollment" },
    { key: "staff", label: "Agent", sees: "Time in and out, sales, leave and payslips" },
  ],
} as const;

export const demoEmail = (role: string) => `${role}@demo.crewbase.example`;

export function findDemoRole(role: string) {
  return DEMO.roles.find((r) => r.key === role) ?? null;
}
