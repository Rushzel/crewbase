// The demo businesses and their one-click sign-ins. Every business and person is made up.
// The sign-in email is `${role}.${business}@crewbase.example`; the password is read on the server only.
export const DEMOS = [
  {
    key: "harbor",
    slug: "harbor-lane",
    name: "Harbor Lane Café",
    color: "#b45309",
    about: "A small team: two branches, hourly staff on shifts, circle boundaries, face check off.",
    roles: [
      { key: "owner", label: "Owner", sees: "Everything, including payroll and settings" },
      { key: "manager", label: "Shift lead", sees: "Their team's time, corrections and leave" },
      { key: "employee", label: "Barista", sees: "Time in and out, own leave and payslips" },
    ],
  },
  {
    key: "northgate",
    slug: "northgate",
    name: "Northgate Solar",
    color: "#0f766e",
    about: "Field teams: agents selling solar kits in three areas, team leaders, face check with liveness, sales and incentives.",
    roles: [
      { key: "owner", label: "Owner", sees: "Everything" },
      { key: "general-manager", label: "General manager", sees: "The whole business, payroll and approvals" },
      { key: "hr", label: "HR manager", sees: "Accounts, leave, payroll and the audit trail" },
      { key: "operations", label: "Operations manager", sees: "Areas, teams, attendance and sales approvals" },
      { key: "team-leader", label: "Team leader", sees: "Their area's agents, rankings and face enrollment" },
      { key: "staff", label: "Agent", sees: "Time in and out, sales, leave and payslips" },
    ],
  },
] as const;

export function findDemo(business: string, role: string) {
  const demo = DEMOS.find((d) => d.key === business);
  const found = demo?.roles.find((r) => r.key === role);
  return demo && found ? { demo, role: found } : null;
}
