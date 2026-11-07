import { describe, expect, it } from "vitest";
import { requestTiming } from "./request-timing";

const ph = (iso: string) => new Date(`${iso}+08:00`);
// Mon Nov 2 2026, 09:00 PH time. The limit is 3 business days = 27 h (Mon–Fri, 8–17).
const sent = ph("2026-11-02T09:00:00");

describe("requestTiming", () => {
  it("counts a reply in business hours", () => {
    const t = requestTiming({ requestedAt: sent, respondedAt: ph("2026-11-02T12:00:00"), status: "responded" }, ph("2026-11-10T00:00:00"));
    expect(t).toEqual({ scoredHours: 3, elapsedHours: 3, state: "replied" });
  });

  it("does not count an open request that is still within the limit", () => {
    const t = requestTiming({ requestedAt: sent, respondedAt: null, status: "open" }, ph("2026-11-03T09:00:00"));
    expect(t.state).toBe("waiting");
    expect(t.scoredHours).toBeNull();
    expect(t.elapsedHours).toBe(9);
  });

  it("counts no reply after 3 business days as a fail at the limit (never ignored)", () => {
    const t = requestTiming({ requestedAt: sent, respondedAt: null, status: "open" }, ph("2026-11-05T10:00:00"));
    expect(t.state).toBe("no_response");
    expect(t.scoredHours).toBe(27);
  });

  it("caps a very late reply at the limit", () => {
    const t = requestTiming({ requestedAt: sent, respondedAt: ph("2026-11-09T09:00:00"), status: "responded" }, ph("2026-11-10T00:00:00"));
    expect(t.state).toBe("replied_late");
    expect(t.scoredHours).toBe(27);
    expect(t.elapsedHours).toBe(45); // Mon 8 h + Tue–Fri 4 × 9 h + next Mon 1 h
  });

  it("never counts a withdrawn request", () => {
    const t = requestTiming({ requestedAt: sent, respondedAt: null, status: "closed" }, ph("2026-11-20T00:00:00"));
    expect(t).toEqual({ scoredHours: null, elapsedHours: 0, state: "closed" });
  });
});
