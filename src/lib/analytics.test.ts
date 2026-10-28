import { describe, expect, it } from "vitest";
import { flagsFor, median, weekdayForecast } from "./analytics";

const base = { attendance_rate: 0.98, on_time_rate: 0.95, overtime_share: 0.05, missing_out_rate: 0, verification_failure_rate: 0, enough_data: true };

describe("median", () => {
  it("handles odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("flagsFor", () => {
  it("raises nothing for a steady record", () => expect(flagsFor(base)).toEqual([]));
  it("names the rule behind each flag", () => {
    const flags = flagsFor({ ...base, on_time_rate: 0.6, overtime_share: 0.3 });
    expect(flags.map((f) => f.rule)).toEqual(["On time on fewer than 80% of days", "Overtime over 15% of hours (burnout risk)"]);
    expect(flags[0].detail).toBe("60%");
  });
  it("never flags people with too little data", () => expect(flagsFor({ ...base, attendance_rate: 0.2, enough_data: false })).toEqual([]));
});

describe("weekdayForecast", () => {
  it("averages the same weekday and reports the range", () => {
    // Mondays 5 and 12 Oct 2026: 400 and 500 minutes.
    const f = weekdayForecast([{ day: "2026-10-05", worked_minutes: 400 }, { day: "2026-10-12", worked_minutes: 500 }], "2026-10-19");
    expect(f[0]).toEqual({ day: "2026-10-19", expected: 450, low: 400, high: 500, samples: 2 });
    expect(f[1].samples).toBe(0);
  });
});
