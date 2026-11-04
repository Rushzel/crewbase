// The demo business and its one-click sign-ins. The business and every person in it are made up.
// Each role signs in as `${role}@demo.crewbase.example`; the password is read on the server only.
export const DEMO = {
  slug: "demo-company",
  name: "Demo Company",
  about: "Field employees selling packages in three areas, with leaders, face check with liveness, leave, sales and payroll.",
  roles: [
    { key: "owner", label: "Owner", sees: "Everything" },
    { key: "finance", label: "Finance", sees: "Payroll, pay rates, sales approvals and products" },
    { key: "hr", label: "Human Resources", sees: "Accounts, areas and teams, leave and the audit trail" },
    { key: "leader", label: "Leader", sees: "Their area's team, corrections, rankings and face enrollment" },
    { key: "employee", label: "Employee", sees: "Time in and out, sales, leave and payslips" },
  ],
} as const;

export const demoEmail = (role: string) => `${role}@demo.crewbase.example`;

export function findDemoRole(role: string) {
  return DEMO.roles.find((r) => r.key === role) ?? null;
}
