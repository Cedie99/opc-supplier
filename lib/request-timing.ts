import { businessHoursBetween } from "@/lib/business-hours";
import { REQUEST_NO_RESPONSE_AFTER_HOURS, type RequestStatus } from "@/lib/constants";

export type RequestTiming = {
  /** Business hours used for scoring, or null when the request does not count (yet). */
  scoredHours: number | null;
  /** Business hours elapsed so far (open) or until the reply. */
  elapsedHours: number;
  state: "replied" | "replied_late" | "waiting" | "no_response" | "closed";
};

/**
 * How one request counts towards Responsiveness:
 *  - replied → business hours to the reply, capped at the no-response limit (a very late reply = a no-response)
 *  - no reply and the limit has passed → counted at the limit (a no-reply is a fail, not ignored)
 *  - still within the limit → not counted yet
 *  - withdrawn → never counted
 */
export function requestTiming(
  r: { requestedAt: Date; respondedAt: Date | null; status: RequestStatus },
  now: Date,
  holidays: ReadonlySet<string> = new Set(),
  limit = REQUEST_NO_RESPONSE_AFTER_HOURS,
): RequestTiming {
  if (r.status === "closed") return { scoredHours: null, elapsedHours: 0, state: "closed" };
  if (r.respondedAt) {
    const h = businessHoursBetween(r.requestedAt, r.respondedAt, holidays);
    return { scoredHours: Math.min(h, limit), elapsedHours: h, state: h > limit ? "replied_late" : "replied" };
  }
  const h = businessHoursBetween(r.requestedAt, now, holidays);
  if (h >= limit) return { scoredHours: limit, elapsedHours: h, state: "no_response" };
  return { scoredHours: null, elapsedHours: h, state: "waiting" };
}
