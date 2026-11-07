import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";

/**
 * Outgoing email. Every message is first saved to the outbox (so there is always a record of what was sent),
 * then sent through SMTP. Without SMTP settings the message stays in the outbox as "not_configured" and can be
 * sent later from the Outbox page once the settings are added.
 */

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export function emailFrom() {
  return process.env.SMTP_FROM ?? "";
}

let transport: Transporter | null = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 = implicit TLS; 587 = STARTTLS (upgraded automatically).
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }
  return transport;
}

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  relatedType?: string;
  relatedId?: string;
  supplierId?: string | null;
  createdBy?: string | null;
};

/** Saves the email to the outbox and tries to send it. Never throws: a failed send is recorded on the row. */
export async function queueEmail(email: OutgoingEmail): Promise<{ id: string; status: string }> {
  const [row] = await db
    .insert(emailOutbox)
    .values({
      toEmail: email.to,
      replyTo: email.replyTo ?? null,
      subject: email.subject,
      html: email.html,
      text: email.text,
      relatedType: email.relatedType,
      relatedId: email.relatedId,
      supplierId: email.supplierId ?? null,
      createdBy: email.createdBy ?? null,
    })
    .returning({ id: emailOutbox.id });
  const status = await deliver(row.id);
  return { id: row.id, status };
}

/** Sends one outbox email (again). Returns the new status. */
export async function deliver(id: string): Promise<string> {
  const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, id) });
  if (!row) return "missing";
  if (row.status === "sent") return "sent";
  if (!isEmailConfigured()) {
    await db.update(emailOutbox).set({ status: "not_configured", error: null }).where(eq(emailOutbox.id, id));
    return "not_configured";
  }
  try {
    await getTransport().sendMail({
      from: emailFrom(),
      to: row.toEmail,
      replyTo: row.replyTo ?? undefined,
      subject: row.subject,
      html: row.html,
      text: row.text,
    });
    await db
      .update(emailOutbox)
      .set({ status: "sent", sentAt: new Date(), error: null, attempts: row.attempts + 1 })
      .where(eq(emailOutbox.id, id));
    return "sent";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] send failed", message);
    await db
      .update(emailOutbox)
      .set({ status: "failed", error: message.slice(0, 1000), attempts: row.attempts + 1 })
      .where(eq(emailOutbox.id, id));
    return "failed";
  }
}

/** A short, user-facing note about what happened to an email, for toasts. */
export function deliveryNote(status: string) {
  if (status === "sent") return "Email sent.";
  if (status === "not_configured") return "Email saved to the Outbox (sending is not set up yet).";
  return "The email could not be sent; it is in the Outbox to retry.";
}
