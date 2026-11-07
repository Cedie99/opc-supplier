import "server-only";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { communicationLogs, holidays, profiles, suppliers } from "@/lib/db/schema";
import { businessHoursBetween, formatBusinessHours } from "@/lib/business-hours";
import { requestTiming } from "@/lib/request-timing";
import {
  REQUEST_NO_RESPONSE_AFTER_HOURS,
  REQUEST_REMINDER_AFTER_HOURS,
  REQUEST_TYPE_LABELS,
  RESPONSIVENESS_MIN_REQUESTS,
} from "@/lib/constants";
import { queueEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates";
import { notify } from "@/lib/notifications";
import { appUrl } from "@/lib/env";
import { recordEvent } from "@/lib/audit";
import { fmtDateTime } from "@/lib/format";

type RequestRow = typeof communicationLogs.$inferSelect;

export async function getHolidaySet(): Promise<Set<string>> {
  const rows = await db.select({ date: holidays.date }).from(holidays);
  return new Set(rows.map((r) => r.date));
}

export { requestTiming, type RequestTiming } from "@/lib/request-timing";

/** Responsiveness for a quarter, from requests sent in that quarter. */
export async function getResponsiveness(supplierId: string, start: Date, end: Date) {
  const [rows, hol] = await Promise.all([
    db
      .select()
      .from(communicationLogs)
      .where(and(eq(communicationLogs.supplierId, supplierId), gte(communicationLogs.requestedAt, start), lt(communicationLogs.requestedAt, end))),
    getHolidaySet(),
  ]);
  const now = new Date();
  let totalHours = 0;
  let counted = 0;
  let noResponses = 0;
  let manual = 0;
  let waiting = 0;
  for (const r of rows) {
    const t = requestTiming(r, now, hol);
    if (t.state === "waiting") waiting++;
    if (t.scoredHours == null) continue;
    totalHours += t.scoredHours;
    counted++;
    if (t.state === "no_response" || t.state === "replied_late") noResponses++;
    if (r.channel === "manual" || r.respondedVia === "other") manual++;
  }
  if (!counted) return null;
  return {
    totalHours: Math.round(totalHours * 100) / 100,
    requests: counted,
    noResponses,
    manual,
    waiting,
    lowSample: counted < RESPONSIVENESS_MIN_REQUESTS,
  };
}

// ─── Emails ──────────────────────────────────────────────────────────────────

export function requestLink(token: string) {
  return `${appUrl()}/respond/${token}`;
}

export function requestEmail(opts: {
  supplierName: string;
  contactName?: string | null;
  senderName: string;
  type: RequestRow["requestType"];
  subject: string;
  message: string | null;
  token: string;
  expiresAt: Date;
  reminder?: boolean;
}) {
  const kind = REQUEST_TYPE_LABELS[opts.type];
  return {
    subject: `${opts.reminder ? "Reminder: " : ""}${kind} — ${opts.subject}`,
    ...renderEmail({
      preheader: `${opts.senderName} from Oracle Petroleum sent you a ${kind.toLowerCase()}.`,
      heading: opts.reminder ? `Reminder: we are still waiting for your reply` : `${kind} from Oracle Petroleum`,
      paragraphs: [
        `Hello${opts.contactName ? ` ${opts.contactName}` : ""},`,
        opts.reminder
          ? `This is a reminder about the request below from ${opts.senderName}. Please reply using the button.`
          : `${opts.senderName} from Oracle Petroleum Purchasing sent ${opts.supplierName} the request below. Please reply using the button — it only takes a minute.`,
      ],
      details: [
        { label: "Request", value: kind },
        { label: "Subject", value: opts.subject },
      ],
      quote: opts.message,
      button: { label: "Reply to this request", url: requestLink(opts.token) },
      footnote: `Replies sent through this link are how we measure supplier responsiveness in our quarterly evaluation, so please use the link rather than replying by email. The link works until ${fmtDateTime(opts.expiresAt)}.`,
    }),
  };
}

// ─── Reminders and no-response sweep ─────────────────────────────────────────

let lastSweep = 0;

/**
 * Sends one reminder after 1 business day without a reply and marks requests as "no response" after 3 business
 * days (notifying the sender). Safe to call often: it is throttled per server process and idempotent.
 * Called by /api/cron/requests (schedule it hourly) and opportunistically when staff open the app.
 */
export async function sweepRequests(opts: { force?: boolean } = {}) {
  const now = Date.now();
  if (!opts.force && now - lastSweep < 10 * 60_000) return { skipped: true as const };
  lastSweep = now;

  const open = await db
    .select({ r: communicationLogs, supplierName: suppliers.name, contactName: suppliers.contactPerson, senderName: profiles.fullName, senderEmail: profiles.email })
    .from(communicationLogs)
    .innerJoin(suppliers, eq(suppliers.id, communicationLogs.supplierId))
    .leftJoin(profiles, eq(profiles.id, communicationLogs.loggedBy))
    .where(and(eq(communicationLogs.channel, "link"), eq(communicationLogs.status, "open"), isNull(communicationLogs.respondedAt)));
  if (!open.length) return { reminders: 0, noResponses: 0 };

  const hol = await getHolidaySet();
  let reminders = 0;
  let noResponses = 0;
  for (const { r, supplierName, contactName, senderName, senderEmail } of open) {
    const elapsed = businessHoursBetween(r.requestedAt, new Date(), hol);
    if (elapsed >= REQUEST_NO_RESPONSE_AFTER_HOURS) {
      const claimed = await db
        .update(communicationLogs)
        .set({ status: "no_response", noResponseAt: new Date() })
        .where(and(eq(communicationLogs.id, r.id), eq(communicationLogs.status, "open")))
        .returning({ id: communicationLogs.id });
      if (!claimed.length) continue;
      noResponses++;
      await recordEvent(db, {
        entityType: "request",
        entityId: r.id,
        supplierId: r.supplierId,
        action: "no_response",
        actorLabel: "System",
        note: `${REQUEST_TYPE_LABELS[r.requestType]}: ${r.subject} — no reply after ${formatBusinessHours(REQUEST_NO_RESPONSE_AFTER_HOURS)}`,
      });
      await notify([r.loggedBy], {
        title: `No response from ${supplierName}`,
        body: `${r.subject} — no reply after 3 business days. It counts against Responsiveness; a late reply is still recorded.`,
        href: `/suppliers/${r.supplierId}?tab=activity`,
      });
    } else if (!r.reminderSentAt && elapsed >= REQUEST_REMINDER_AFTER_HOURS && r.token && r.recipientEmail && r.expiresAt) {
      const claimed = await db
        .update(communicationLogs)
        .set({ reminderSentAt: new Date() })
        .where(and(eq(communicationLogs.id, r.id), isNull(communicationLogs.reminderSentAt)))
        .returning({ id: communicationLogs.id });
      if (!claimed.length) continue;
      reminders++;
      const email = requestEmail({
        supplierName,
        contactName,
        senderName: senderName ?? "Purchasing",
        type: r.requestType,
        subject: r.subject,
        message: r.message,
        token: r.token,
        expiresAt: r.expiresAt,
        reminder: true,
      });
      await queueEmail({ to: r.recipientEmail, replyTo: senderEmail, ...email, relatedType: "request_reminder", relatedId: r.id, supplierId: r.supplierId });
    }
  }
  return { reminders, noResponses };
}
