import { BUSINESS_HOURS } from "@/lib/constants";

export type BusinessHoursConfig = {
  utcOffsetHours: number;
  workDays: number[];
  startHour: number;
  endHour: number;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Working hours between two moments, counting only work days between startHour and endHour (local time at a
 * fixed UTC offset — the Philippines has no daylight saving) and skipping holidays ("YYYY-MM-DD", local dates).
 * A request sent Friday 17:00 and answered Monday 09:00 is 1 business hour, not 64.
 */
export function businessHoursBetween(
  from: Date,
  to: Date,
  holidays: ReadonlySet<string> = new Set(),
  config: BusinessHoursConfig = BUSINESS_HOURS,
): number {
  if (!(to > from)) return 0;
  const offset = config.utcOffsetHours * HOUR;
  // Work in "local" milliseconds, where UTC getters return local wall-clock values.
  const start = from.getTime() + offset;
  const end = to.getTime() + offset;
  let total = 0;
  for (let dayStart = Math.floor(start / DAY) * DAY; dayStart < end; dayStart += DAY) {
    const d = new Date(dayStart);
    if (!config.workDays.includes(d.getUTCDay())) continue;
    if (holidays.has(d.toISOString().slice(0, 10))) continue;
    const open = dayStart + config.startHour * HOUR;
    const close = dayStart + config.endHour * HOUR;
    const overlap = Math.min(close, end) - Math.max(open, start);
    if (overlap > 0) total += overlap;
  }
  return total / HOUR;
}

/** Formats business hours for people: "45 min", "3.5 h", "2 days 1 h" (a day = one working day). */
export function formatBusinessHours(hours: number, dayHours = BUSINESS_HOURS.endHour - BUSINESS_HOURS.startHour): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < dayHours) return `${Math.round(hours * 10) / 10} h`;
  const days = Math.floor(hours / dayHours);
  const rest = Math.round(hours - days * dayHours);
  return `${days} day${days === 1 ? "" : "s"}${rest ? ` ${rest} h` : ""}`;
}
