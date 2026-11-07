import "server-only";
import { sql } from "drizzle-orm";
import { addDays, format } from "date-fns";
import { db } from "@/lib/db";
import { canvasses, communicationLogs, correctiveActions, evaluations, supplierDocuments } from "@/lib/db/schema";
import { DOCUMENT_EXPIRY_WARNING_DAYS } from "@/lib/constants";
import { todayIso } from "@/lib/format";

/** Sidebar counts in ONE round trip (each query to the database costs a network hop). */
export async function getSidebarBadges() {
  const today = todayIso();
  const warnDate = format(addDays(new Date(), DOCUMENT_EXPIRY_WARNING_DAYS), "yyyy-MM-dd");
  const [row] = await db.execute<{ pending: number; overdue: number; expiring: number; unanswered: number }>(sql`
    select
      (select count(*) from ${evaluations} where ${evaluations.status} = 'submitted')::int
        + (select count(*) from ${canvasses} where ${canvasses.status} = 'submitted')::int as pending,
      (select count(*) from ${correctiveActions}
         where ${correctiveActions.status} <> 'closed' and ${correctiveActions.dueDate} < ${today})::int as overdue,
      (select count(*) from ${supplierDocuments}
         where ${supplierDocuments.isCurrent} and ${supplierDocuments.expiresOn} is not null
           and ${supplierDocuments.expiresOn} <= ${warnDate})::int as expiring,
      (select count(*) from ${communicationLogs} where ${communicationLogs.status} = 'no_response')::int as unanswered
  `);
  return {
    pendingApprovals: Number(row?.pending ?? 0),
    overdueActions: Number(row?.overdue ?? 0),
    expiringDocuments: Number(row?.expiring ?? 0),
    unansweredRequests: Number(row?.unanswered ?? 0),
  };
}
