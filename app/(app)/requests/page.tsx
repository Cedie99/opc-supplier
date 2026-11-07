import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { RequestList } from "@/components/requests/request-list";
import { db } from "@/lib/db";
import { communicationLogs, profiles, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getHolidaySet, requestTiming } from "@/lib/requests";
import { BUSINESS_HOURS, REQUEST_NO_RESPONSE_AFTER_HOURS } from "@/lib/constants";
import { formatBusinessHours } from "@/lib/business-hours";
import { cn } from "@/lib/utils";

export const metadata = { title: "Supplier requests" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "waiting", label: "Waiting" },
  { key: "no_response", label: "No response" },
  { key: "replied", label: "Replied" },
] as const;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const user = await requireUser();
  const { status } = await searchParams;
  const filter = FILTERS.find((f) => f.key === status)?.key ?? "all";

  const sender = alias(profiles, "sender");
  const [rows, holidays] = await Promise.all([
    db
      .select({ r: communicationLogs, supplierName: suppliers.name, senderName: sender.fullName })
      .from(communicationLogs)
      .innerJoin(suppliers, eq(suppliers.id, communicationLogs.supplierId))
      .leftJoin(sender, eq(sender.id, communicationLogs.loggedBy))
      .orderBy(desc(communicationLogs.requestedAt))
      .limit(300),
    getHolidaySet(),
  ]);
  const now = new Date();
  const all = rows.map(({ r, supplierName, senderName }) => ({ ...r, supplierName, senderName, state: requestTiming(r, now, holidays).state }));
  const counts = {
    all: all.filter((r) => r.state !== "closed").length,
    waiting: all.filter((r) => r.state === "waiting").length,
    no_response: all.filter((r) => r.state === "no_response").length,
    replied: all.filter((r) => r.state === "replied" || r.state === "replied_late").length,
  };
  const shown = all.filter((r) =>
    filter === "all" ? true : filter === "replied" ? r.state === "replied" || r.state === "replied_late" : r.state === filter,
  );
  const days = BUSINESS_HOURS.workDays.map((d) => DAYS[d]);

  return (
    <>
      <PageHeader
        title="Supplier requests"
        description={`Requests sent to suppliers and how fast they replied, in business hours (${days[0]}–${days[days.length - 1]}, ${BUSINESS_HOURS.startHour}:00–${BUSINESS_HOURS.endHour}:00, excluding holidays). No reply after ${formatBusinessHours(REQUEST_NO_RESPONSE_AFTER_HOURS)} counts as no response. Send new requests from a supplier's Activity log tab.`}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/requests" : `/requests?status=${f.key}`}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium",
              filter === f.key ? "bg-forest text-forest-foreground border-transparent" : "bg-card hover:bg-muted",
            )}
          >
            {f.label}
            <span className="rounded-full bg-current/15 px-1.5 text-[11px] leading-5 tabular-nums">{counts[f.key]}</span>
          </Link>
        ))}
      </div>
      <Card>
        <CardContent>
          {shown.length === 0 ? (
            <EmptyState title="No requests here" description="Open a supplier and use Send request in its Activity log tab." />
          ) : (
            <RequestList rows={shown} holidays={holidays} canLog={can(user.role, "logActivity")} showSupplier />
          )}
        </CardContent>
      </Card>
    </>
  );
}
