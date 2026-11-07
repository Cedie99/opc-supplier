import { differenceInCalendarDays, format, formatDistanceToNow, parseISO } from "date-fns";

type DateLike = Date | string | null | undefined;

const toDate = (d: DateLike) => (d == null ? null : typeof d === "string" ? parseISO(d) : d);

export function fmtDate(d: DateLike) {
  const date = toDate(d);
  return date ? format(date, "MMM d, yyyy") : "—";
}

export function fmtDateTime(d: DateLike) {
  const date = toDate(d);
  return date ? format(date, "MMM d, yyyy h:mm a") : "—";
}

export function fmtRelative(d: DateLike) {
  const date = toDate(d);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : "—";
}

export function daysUntil(d: DateLike) {
  const date = toDate(d);
  return date ? differenceInCalendarDays(date, new Date()) : null;
}

export function fmtScore(n: number | null | undefined) {
  return n == null ? "—" : `${Number(n).toFixed(1)}%`;
}

export function fmtNumber(n: number | null | undefined, digits = 2) {
  return n == null ? "—" : Number(n).toLocaleString("en-PH", { maximumFractionDigits: digits });
}

export function fmtMoney(n: number | null | undefined) {
  return n == null ? "—" : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

/** Today as YYYY-MM-DD in local time. */
export function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

export function currentQuarter(date = new Date()) {
  return { year: date.getFullYear(), quarter: Math.floor(date.getMonth() / 3) + 1 };
}

export function quarterRange(year: number, quarter: number) {
  const start = new Date(year, (quarter - 1) * 3, 1);
  const end = new Date(year, quarter * 3, 1);
  return { start, end };
}

export function quarterLabel(year: number, quarter: number) {
  return `Q${quarter} ${year}`;
}
