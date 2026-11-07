import { describe, expect, it } from "vitest";
import { businessHoursBetween, formatBusinessHours } from "./business-hours";

// Philippine time (UTC+8), Mon–Fri 08:00–17:00. Nov 6 2026 is a Friday.
const ph = (iso: string) => new Date(`${iso}+08:00`);

describe("businessHoursBetween", () => {
  it("counts a same-day reply", () => {
    expect(businessHoursBetween(ph("2026-11-04T09:00:00"), ph("2026-11-04T11:30:00"))).toBe(2.5);
  });

  it("skips the night and the weekend: Friday 17:00 → Monday 09:00 is 1 hour", () => {
    expect(businessHoursBetween(ph("2026-11-06T17:00:00"), ph("2026-11-09T09:00:00"))).toBe(1);
  });

  it("starts the clock at opening time for requests sent after hours", () => {
    expect(businessHoursBetween(ph("2026-11-04T20:00:00"), ph("2026-11-05T10:00:00"))).toBe(2);
  });

  it("counts full working days", () => {
    // Wed 08:00 → Fri 17:00 = 3 days × 9 h
    expect(businessHoursBetween(ph("2026-11-04T08:00:00"), ph("2026-11-06T17:00:00"))).toBe(27);
  });

  it("skips holidays", () => {
    const holidays = new Set(["2026-11-05"]);
    expect(businessHoursBetween(ph("2026-11-04T16:00:00"), ph("2026-11-06T09:00:00"), holidays)).toBe(2);
  });

  it("returns 0 when the reply is not after the request", () => {
    expect(businessHoursBetween(ph("2026-11-04T10:00:00"), ph("2026-11-04T10:00:00"))).toBe(0);
    expect(businessHoursBetween(ph("2026-11-04T10:00:00"), ph("2026-11-04T09:00:00"))).toBe(0);
  });
});

describe("formatBusinessHours", () => {
  it("formats minutes, hours and working days", () => {
    expect(formatBusinessHours(0.25)).toBe("15 min");
    expect(formatBusinessHours(3.46)).toBe("3.5 h");
    expect(formatBusinessHours(9)).toBe("1 day");
    expect(formatBusinessHours(20)).toBe("2 days 2 h");
  });
});
