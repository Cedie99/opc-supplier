"use server";

import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { communicationLogs, profiles, suppliers } from "@/lib/db/schema";
import { ActionError } from "@/lib/auth";
import { formToObject, runAction, zRequired, zText, type ActionState } from "@/lib/actions";
import { recordEvent } from "@/lib/audit";
import { confirmUpload, createUploadTicket, readUploadRef, runUploadTicket } from "@/lib/storage";
import type { UploadRequest, UploadTicketResult } from "@/lib/upload-rules";
import { REQUEST_TYPE_LABELS } from "@/lib/constants";
import { RESPONSE_FORM } from "@/lib/request-response";
import { businessHoursBetween, formatBusinessHours } from "@/lib/business-hours";
import { getHolidaySet } from "@/lib/requests";
import { notify } from "@/lib/notifications";
import { queueEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates";
import { appUrl } from "@/lib/env";

const num = (label: string) =>
  z.preprocess((v) => (v === undefined || v === "" ? undefined : Number(v)), z.number({ error: `Enter the ${label}.` }).finite().nonnegative(`Enter a valid ${label}.`));

const SCHEMAS = {
  quotation: z.object({
    respondent: zRequired("Your name", 200),
    unitPrice: num("unit price").refine((v) => v > 0, "Enter a price above 0."),
    leadTimeDays: num("lead time").refine((v) => Number.isInteger(v), "Enter whole days."),
    validUntil: z.iso.date().optional(),
    remarks: zText(2000),
  }),
  delivery: z.object({
    respondent: zRequired("Your name", 200),
    confirmedDate: z.iso.date("Enter the confirmed delivery date."),
    quantity: zText(100),
    remarks: zText(2000),
  }),
  po: z
    .object({
      respondent: zRequired("Your name", 200),
      decision: z.enum(["accept", "changes"], { error: "Choose whether you accept the PO." }),
      remarks: zText(2000),
    })
    .refine((d) => d.decision === "accept" || Boolean(d.remarks), { path: ["remarks"], message: "Describe the changes you need." }),
  general: z.object({
    respondent: zRequired("Your name", 200),
    answer: z.string({ error: "Enter your answer." }).trim().min(5, "Please give a full answer.").max(4000),
  }),
};

/** Public action: permission to attach one file, for as long as the request link can still be answered. */
export async function requestResponseUpload(token: string, file: UploadRequest): Promise<UploadTicketResult> {
  return runUploadTicket(async () => {
    const r = await db.query.communicationLogs.findFirst({
      where: and(
        eq(communicationLogs.token, token),
        eq(communicationLogs.channel, "link"),
        inArray(communicationLogs.status, ["open", "no_response"]),
        isNull(communicationLogs.respondedAt),
        gt(communicationLogs.expiresAt, new Date()),
      ),
    });
    if (!r) throw new ActionError("This link is no longer valid. Please contact our Purchasing team.");
    return createUploadTicket(r.supplierId, file);
  });
}

/** Public action: the supplier answers a request through its link. The reply time is recorded automatically. */
export async function submitResponse(token: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const r = await db.query.communicationLogs.findFirst({
      where: and(
        eq(communicationLogs.token, token),
        eq(communicationLogs.channel, "link"),
        inArray(communicationLogs.status, ["open", "no_response"]),
        isNull(communicationLogs.respondedAt),
        gt(communicationLogs.expiresAt, new Date()),
      ),
    });
    if (!r) throw new ActionError("This link is no longer valid. Please contact our Purchasing team.");

    const form = RESPONSE_FORM[r.requestType];
    const data = SCHEMAS[form].parse(formToObject(formData)) as Record<string, string | number | undefined>;
    const response: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(data)) response[k] = v ?? null;

    const ref = readUploadRef(formData, "file");
    const stored = ref ? await confirmUpload(r.supplierId, ref) : null;

    const respondedAt = new Date();
    const claimed = await db
      .update(communicationLogs)
      .set({ respondedAt, status: "responded", respondedVia: "link", response, responseFile: stored })
      .where(and(eq(communicationLogs.id, r.id), isNull(communicationLogs.respondedAt)))
      .returning({ id: communicationLogs.id });
    if (!claimed.length) throw new ActionError("This request was already answered. Thank you.");

    const hours = businessHoursBetween(r.requestedAt, respondedAt, await getHolidaySet());
    const [supplier, sender] = await Promise.all([
      db.query.suppliers.findFirst({ where: eq(suppliers.id, r.supplierId), columns: { name: true } }),
      r.loggedBy ? db.query.profiles.findFirst({ where: eq(profiles.id, r.loggedBy), columns: { email: true, fullName: true } }) : null,
    ]);
    const supplierName = supplier?.name ?? "The supplier";
    const href = `/suppliers/${r.supplierId}?tab=activity`;

    await recordEvent(db, {
      entityType: "request",
      entityId: r.id,
      supplierId: r.supplierId,
      action: "supplier_replied",
      actorLabel: `${String(response.respondent)} (supplier)`,
      note: `${REQUEST_TYPE_LABELS[r.requestType]}: ${r.subject} — replied in ${formatBusinessHours(hours)} (business hours)`,
    });
    await notify([r.loggedBy], { title: `${supplierName} replied`, body: `${r.subject} — in ${formatBusinessHours(hours)}`, href });
    if (sender?.email) {
      await queueEmail({
        to: sender.email,
        subject: `${supplierName} replied: ${r.subject}`,
        ...renderEmail({
          preheader: `${supplierName} replied to your ${REQUEST_TYPE_LABELS[r.requestType].toLowerCase()}.`,
          heading: `${supplierName} replied to your request`,
          paragraphs: [`${String(response.respondent)} replied to "${r.subject}" in ${formatBusinessHours(hours)} (business hours).`],
          button: { label: "Open the reply", url: `${appUrl()}${href}` },
        }),
        relatedType: "request_reply",
        relatedId: r.id,
        supplierId: r.supplierId,
      });
    }
  });
  if (result.error) return result;
  redirect(`/respond/${token}/done`);
}
