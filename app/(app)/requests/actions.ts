"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { addDays } from "date-fns";
import { z } from "zod";
import { db } from "@/lib/db";
import { communicationLogs, emailOutbox, notifications, suppliers } from "@/lib/db/schema";
import { authorize, ActionError, requireUser } from "@/lib/auth";
import { formToObject, parseLocalDateTime, runAction, zRequired, type ActionState } from "@/lib/actions";
import { recordEvent } from "@/lib/audit";
import { REQUEST_LINK_DAYS, REQUEST_TYPES, REQUEST_TYPE_LABELS } from "@/lib/constants";
import { deliver, deliveryNote, queueEmail } from "@/lib/email";
import { requestEmail, requestLink } from "@/lib/requests";

const sendSchema = z.object({
  requestType: z.enum(REQUEST_TYPES),
  subject: zRequired("Subject", 300),
  message: zRequired("Message", 4000),
  email: z.email("Enter the supplier's email address."),
});

/** Sends a request to the supplier: a link by email, where the supplier replies. The clock starts now. */
export async function sendRequest(supplierId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("logActivity");
    const data = sendSchema.parse(formToObject(formData));
    const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId) });
    if (!supplier) throw new ActionError("Supplier not found.");
    if (supplier.status === "inactive") throw new ActionError("This supplier is inactive.");

    const token = randomBytes(24).toString("base64url");
    const now = new Date();
    const expiresAt = addDays(now, REQUEST_LINK_DAYS);
    const [row] = await db
      .insert(communicationLogs)
      .values({
        supplierId,
        requestType: data.requestType,
        subject: data.subject,
        message: data.message,
        recipientEmail: data.email,
        requestedAt: now,
        loggedBy: user.id,
        channel: "link",
        status: "open",
        token,
        expiresAt,
      })
      .returning({ id: communicationLogs.id });
    await recordEvent(db, {
      entityType: "request",
      entityId: row.id,
      supplierId,
      action: "request_sent",
      actorId: user.id,
      note: `${REQUEST_TYPE_LABELS[data.requestType]}: ${data.subject} → ${data.email}`,
    });

    const email = requestEmail({
      supplierName: supplier.name,
      contactName: supplier.contactPerson,
      senderName: user.fullName,
      type: data.requestType,
      subject: data.subject,
      message: data.message,
      token,
      expiresAt,
    });
    const sent = await queueEmail({
      to: data.email,
      replyTo: user.email,
      ...email,
      relatedType: "request",
      relatedId: row.id,
      supplierId,
      createdBy: user.id,
    });
    revalidatePath(`/suppliers/${supplierId}`);
    revalidatePath("/requests");
    return { ok: true, message: `Request sent. ${deliveryNote(sent.status)}`, link: requestLink(token) };
  });
}

/** The supplier answered by phone, chat or email instead of the link: record when. Marked as a manual reply. */
export async function recordOutsideReply(requestId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("logActivity");
    const raw = z.string({ error: "Enter the reply time." }).min(1, "Enter the reply time.").parse(formData.get("respondedAt"));
    const respondedAt = parseLocalDateTime(raw, Number(formData.get("tzOffset") ?? 0));
    const note = z.string().max(1000).optional().parse(formData.get("note")?.toString().trim() || undefined);
    const r = await db.query.communicationLogs.findFirst({ where: eq(communicationLogs.id, requestId) });
    if (!r) throw new ActionError("Request not found.");
    if (r.respondedAt) throw new ActionError("This request already has a reply.");
    if (respondedAt < r.requestedAt) {
      return { error: "Please check the highlighted fields.", fieldErrors: { respondedAt: ["The reply cannot be before the request."] } };
    }
    if (respondedAt > new Date()) {
      return { error: "Please check the highlighted fields.", fieldErrors: { respondedAt: ["The reply time cannot be in the future."] } };
    }
    await db
      .update(communicationLogs)
      .set({ respondedAt, status: "responded", respondedVia: "other", response: note ? { answer: note } : r.response })
      .where(and(eq(communicationLogs.id, requestId), isNull(communicationLogs.respondedAt)));
    await recordEvent(db, {
      entityType: "request",
      entityId: requestId,
      supplierId: r.supplierId,
      action: "reply_recorded_manually",
      actorId: user.id,
      note: `${r.subject}${note ? ` — ${note}` : ""}`,
    });
    revalidatePath(`/suppliers/${r.supplierId}`);
    revalidatePath("/requests");
    return { ok: true, message: "Reply recorded." };
  });
}

/** Withdraws a request sent by mistake. It no longer counts towards Responsiveness and its link stops working. */
export async function closeRequest(requestId: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("logActivity");
    const r = await db.query.communicationLogs.findFirst({ where: eq(communicationLogs.id, requestId) });
    if (!r) throw new ActionError("Request not found.");
    if (r.respondedAt) throw new ActionError("A request with a reply cannot be withdrawn.");
    await db.update(communicationLogs).set({ status: "closed" }).where(eq(communicationLogs.id, requestId));
    await recordEvent(db, { entityType: "request", entityId: requestId, supplierId: r.supplierId, action: "request_withdrawn", actorId: user.id, note: r.subject });
    revalidatePath(`/suppliers/${r.supplierId}`);
    revalidatePath("/requests");
    return { ok: true, message: "Request withdrawn." };
  });
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const user = await requireUser();
  const where = ids?.length
    ? and(eq(notifications.userId, user.id), inArray(notifications.id, ids.slice(0, 100)))
    : and(eq(notifications.userId, user.id), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: new Date() }).where(where);
  revalidatePath("/", "layout");
}

/** Retries an email from the Outbox (for example after SMTP settings were added). */
export async function resendEmail(id: string): Promise<ActionState> {
  return runAction(async () => {
    await authorize("inviteSuppliers");
    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, id) });
    if (!row) throw new ActionError("Email not found.");
    const status = await deliver(id);
    revalidatePath("/outbox");
    if (status === "not_configured") throw new ActionError("Email sending is not set up yet. Add the SMTP settings first.");
    if (status === "failed") throw new ActionError("Sending failed again. See the error on the Outbox page.");
    return { ok: true, message: "Email sent." };
  });
}
