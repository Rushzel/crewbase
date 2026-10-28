// Display formats: durations as "7h 06m", dates day-first ("21 Oct 2026"), money from minor units.

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "–";
  const sign = minutes < 0 ? "-" : "";
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${sign}${h}h ${m.toString().padStart(2, "0")}m`;
}

export function formatDate(value: string | Date | null | undefined, timeZone = "Asia/Manila"): string {
  if (!value) return "–";
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  const zone = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : timeZone;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: zone }).format(date);
}

export function formatTime(value: string | Date | null | undefined, timeZone = "Asia/Manila"): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(value));
}

export function formatMoney(minor: number | bigint | null | undefined, currency = "PHP"): string {
  if (minor == null) return "–";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(minor) / 100);
}

export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  if (ratio == null || !Number.isFinite(ratio)) return "–";
  return `${(ratio * 100).toFixed(digits)}%`;
}

// Today's date (YYYY-MM-DD) in a timezone.
export function todayIn(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Contrast ratio between two hex colours (WCAG formula), used to reject unreadable brand colours.
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
    const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(hexA), lum(hexB)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
