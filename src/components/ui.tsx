// Small presentational pieces shared by the screens.

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="card">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

const TONES = {
  good: "bg-green-50 text-good",
  warn: "bg-amber-50 text-warn",
  bad: "bg-red-50 text-bad",
  info: "bg-brand/10 text-brand",
  quiet: "bg-canvas text-muted",
} as const;

export function Pill({ tone = "quiet", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`pill ${TONES[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}

export const STATUS_TONE: Record<string, keyof typeof TONES> = {
  working: "good",
  on_break: "warn",
  closed: "quiet",
  missing_out: "bad",
  pending: "warn",
  approved: "good",
  rejected: "bad",
  withdrawn: "quiet",
  open: "info",
  in_review: "warn",
  locked: "quiet",
  finalized: "good",
  draft: "warn",
  final: "good",
  void: "bad",
  // Daily attendance
  present: "good",
  late: "warn",
  half_day: "warn",
  absent: "bad",
  on_leave: "info",
  not_yet: "quiet",
  rest_day: "quiet",
  // Sales
  awaiting_verification: "quiet",
  follow_up: "warn",
  for_approval: "info",
  cancelled: "quiet",
};

const LABELS: Record<string, string> = {
  awaiting_verification: "Waiting for customer",
  follow_up: "Follow up",
  for_approval: "Ready for approval",
  not_yet: "Not in yet",
  half_day: "Half day",
  on_leave: "On leave",
};

export function initials(name: string) {
  return name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
      {initials(name)}
    </span>
  );
}

export function statusLabel(s: string) {
  if (LABELS[s]) return LABELS[s];
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
