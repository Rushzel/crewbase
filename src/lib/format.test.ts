import { describe, expect, it } from "vitest";
import { addDays, contrastRatio, formatDate, formatDuration, formatMoney, formatPercent, formatTime, todayIn } from "./format";

describe("formatDuration", () => {
  it("pads minutes", () => expect(formatDuration(426)).toBe("7h 06m"));
  it("handles zero and hours over a day", () => {
    expect(formatDuration(0)).toBe("0h 00m");
    expect(formatDuration(1505)).toBe("25h 05m");
  });
  it("shows a dash for missing values", () => expect(formatDuration(null)).toBe("–"));
});

describe("formatDate", () => {
  it("is day-first without a weekday", () => expect(formatDate("2026-10-21")).toBe("21 Oct 2026"));
  it("uses the business timezone for timestamps", () => {
    // 23:30 UTC on 20 Oct is 07:30 on 21 Oct in Manila.
    expect(formatDate("2026-10-20T23:30:00Z", "Asia/Manila")).toBe("21 Oct 2026");
  });
});

describe("formatTime", () => {
  it("shows 24-hour time in the timezone", () => expect(formatTime("2026-10-21T00:05:00Z", "Asia/Manila")).toBe("08:05"));
});

describe("formatMoney", () => {
  it("converts minor units", () => expect(formatMoney(161500)).toBe("₱1,615.00"));
});

describe("formatPercent", () => {
  it("rounds", () => expect(formatPercent(0.8333, 1)).toBe("83.3%"));
});

describe("dates", () => {
  it("finds today in a timezone", () => expect(todayIn("Asia/Manila", new Date("2026-10-20T23:30:00Z"))).toBe("2026-10-21"));
  it("adds days across months", () => expect(addDays("2026-10-30", 3)).toBe("2026-11-02"));
});

describe("contrastRatio", () => {
  it("is 21 for black on white", () => expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0));
  it("flags a pale brand colour on white as unreadable", () => expect(contrastRatio("#ffd60a", "#ffffff")).toBeLessThan(3));
});
