import "server-only";
import { and, eq, gte, lt } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { complaints } from "@/lib/db/schema";
import { quarterRange } from "@/lib/format";
import { getResponsiveness } from "@/lib/requests";

/**
 * Numbers for the quarter taken from the activity logs, offered to the evaluator as suggestions.
 * Responsiveness: business hours to the first reply; requests with no reply after 3 business days count at that
 * limit (see lib/requests.ts).
 */
export async function getActivityMetrics(supplierId: string, year: number, quarter: number) {
  const { start, end } = quarterRange(year, quarter);
  const startIso = format(start, "yyyy-MM-dd");
  const endIso = format(end, "yyyy-MM-dd");

  const [responsiveness, due] = await Promise.all([
    getResponsiveness(supplierId, start, end),
    db
      .select({ dueOn: complaints.dueOn, resolvedOn: complaints.resolvedOn })
      .from(complaints)
      .where(and(eq(complaints.supplierId, supplierId), gte(complaints.dueOn, startIso), lt(complaints.dueOn, endIso))),
  ]);

  const onTime = due.filter((c) => c.resolvedOn && c.resolvedOn <= c.dueOn).length;

  return {
    responsiveness,
    afterSales: { due: due.length, resolvedOnTime: onTime },
  };
}
