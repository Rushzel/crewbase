// Analytics helpers that run on numbers the database already filtered by row-level security.

export function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export type Flag = { rule: string; detail: string };

type Metrics = {
  attendance_rate: number | null;
  on_time_rate: number | null;
  overtime_share: number | null;
  missing_out_rate: number | null;
  verification_failure_rate: number | null;
  enough_data: boolean;
};

// Each flag states the rule that raised it, so a manager can see why someone is listed.
export function flagsFor(m: Metrics): Flag[] {
  if (!m.enough_data) return [];
  const flags: Flag[] = [];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  if (m.attendance_rate != null && m.attendance_rate < 0.9) flags.push({ rule: "Attendance under 90%", detail: pct(m.attendance_rate) });
  if (m.on_time_rate != null && m.on_time_rate < 0.8) flags.push({ rule: "On time on fewer than 80% of days", detail: pct(m.on_time_rate) });
  if (m.overtime_share != null && m.overtime_share > 0.15) flags.push({ rule: "Overtime over 15% of hours (burnout risk)", detail: pct(m.overtime_share) });
  if (m.missing_out_rate != null && m.missing_out_rate > 0.05) flags.push({ rule: "Missing time out on over 5% of entries", detail: pct(m.missing_out_rate) });
  if (m.verification_failure_rate != null && m.verification_failure_rate > 0.1) flags.push({ rule: "Over 10% of punches failed or flagged checks", detail: pct(m.verification_failure_rate) });
  return flags;
}

// Forecast of daily worked minutes for the next 7 days: for each weekday, the average of the
// same weekday over the history, with the lowest and highest seen as the range.
// Deliberately simple and explainable; it says how wide the range is instead of hiding it.
export function weekdayForecast(history: { day: string; worked_minutes: number }[], from: string) {
  const byWeekday = new Map<number, number[]>();
  for (const h of history) {
    const wd = new Date(`${h.day}T00:00:00Z`).getUTCDay();
    byWeekday.set(wd, [...(byWeekday.get(wd) ?? []), h.worked_minutes]);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const xs = byWeekday.get(d.getUTCDay()) ?? [];
    const avg = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    return { day: d.toISOString().slice(0, 10), expected: avg, low: xs.length ? Math.min(...xs) : 0, high: xs.length ? Math.max(...xs) : 0, samples: xs.length };
  });
}
