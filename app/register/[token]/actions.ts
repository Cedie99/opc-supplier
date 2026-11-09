"use server";

import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { documentTypes, supplierDocuments, supplierInvites, suppliers } from "@/lib/db/schema";
import { ActionError } from "@/lib/auth";
import { formToObject, runAction, zRequired, zText, type ActionState } from "@/lib/actions";
import { recordEvent } from "@/lib/audit";
import { confirmUpload, createUploadTicket, readUploadRef, runUploadTicket } from "@/lib/storage";
import type { UploadRef, UploadRequest, UploadTicketResult } from "@/lib/upload-rules";

const schema = z.object({
  name: zRequired("Registered company name"),
  tradeName: zText(200),
  contactPerson: zRequired("Contact person"),
  email: z.email("Enter a valid email."),
  phone: zRequired("Phone", 100),
  address: zRequired("Address", 500),
  tin: zText(50),
  website: zText(300),
  yearEstablished: z.preprocess(
    (v) => (v === undefined ? undefined : Number(v)),
    z.number().int().min(1800, "Enter a valid year.").max(new Date().getFullYear(), "Enter a valid year.").optional(),
  ),
  creditTermsDays: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(0).max(365).optional()),
  confirm: z.literal("on", { error: "Please confirm the information is true and correct." }),
});

/** Public action: permission to send one file, for as long as the registration or re-upload link is valid. */
export async function requestInviteUpload(token: string, file: UploadRequest): Promise<UploadTicketResult> {
  return runUploadTicket(async () => {
    const invite = await db.query.supplierInvites.findFirst({
      where: and(eq(supplierInvites.token, token), isNull(supplierInvites.submittedAt), gt(supplierInvites.expiresAt, new Date())),
    });
    if (!invite?.supplierId) throw new ActionError("This link is no longer valid. Please ask our Purchasing team for a new link.");
    return createUploadTicket(invite.supplierId, file);
  });
}

/** Public action: a supplier submits its details and documents through a registration link. */
export async function submitRegistration(token: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const invite = await db.query.supplierInvites.findFirst({
      where: and(
        eq(supplierInvites.token, token),
        eq(supplierInvites.purpose, "registration"),
        isNull(supplierInvites.submittedAt),
        gt(supplierInvites.expiresAt, new Date()),
      ),
    });
    if (!invite?.supplierId) throw new ActionError("This registration link is no longer valid. Please ask Purchasing for a new link.");
    const supplierId = invite.supplierId;

    const data = schema.parse(formToObject(formData));
    const { confirm: _confirm, ...details } = data;
    void _confirm;

    const types = await db.select().from(documentTypes).where(eq(documentTypes.isActive, true));
    const uploads: { typeId: string; typeName: string; ref: UploadRef; expiresOn: string | null }[] = [];
    const fieldErrors: Record<string, string[]> = {};
    for (const t of types) {
      const ref = readUploadRef(formData, `doc:${t.id}`);
      const expiresOn = formData.get(`exp:${t.id}`)?.toString() || null;
      if (t.isMandatory && !ref) fieldErrors[`doc:${t.id}`] = [`${t.name} is required.`];
      if (ref && t.hasExpiry && !expiresOn) fieldErrors[`exp:${t.id}`] = ["Enter the expiry date."];
      if (ref) uploads.push({ typeId: t.id, typeName: t.name, ref, expiresOn: t.hasExpiry ? expiresOn : null });
    }
    if (Object.keys(fieldErrors).length) return { error: "Please complete the required documents.", fieldErrors };

    // Confirm the files first (outside the transaction), then record everything at once.
    const stored: (typeof uploads[number] & Awaited<ReturnType<typeof confirmUpload>>)[] = [];
    for (const u of uploads) stored.push({ ...u, ...(await confirmUpload(supplierId, u.ref)) });

    await db.transaction(async (tx) => {
      // Claim the invite atomically so the link cannot be used twice.
      const claimed = await tx
        .update(supplierInvites)
        .set({ submittedAt: new Date() })
        .where(and(eq(supplierInvites.id, invite.id), isNull(supplierInvites.submittedAt)))
        .returning({ id: supplierInvites.id });
      if (!claimed.length) throw new ActionError("This registration was already submitted.");

      await tx.update(suppliers).set({ ...details, status: "under_review" }).where(eq(suppliers.id, supplierId));
      for (const s of stored) {
        await tx
          .update(supplierDocuments)
          .set({ isCurrent: false })
          .where(and(eq(supplierDocuments.supplierId, supplierId), eq(supplierDocuments.documentTypeId, s.typeId)));
        await tx.insert(supplierDocuments).values({
          supplierId,
          documentTypeId: s.typeId,
          storagePath: s.path,
          fileName: s.fileName,
          fileSize: s.fileSize,
          mimeType: s.mimeType,
          expiresOn: s.expiresOn,
        });
      }
      await recordEvent(tx, {
        entityType: "invite",
        entityId: invite.id,
        supplierId,
        action: "registration_submitted",
        actorLabel: `${details.contactPerson} (supplier)`,
        note: `${stored.length} document(s) uploaded`,
      });
    });
  });
  if (result.error) return result;
  redirect(`/register/${token}/done`);
}

/** Public action: a supplier uploads again only the documents a re-upload link asks for. Company details are untouched. */
export async function submitResubmission(token: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const invite = await db.query.supplierInvites.findFirst({
      where: and(
        eq(supplierInvites.token, token),
        eq(supplierInvites.purpose, "resubmission"),
        isNull(supplierInvites.submittedAt),
        gt(supplierInvites.expiresAt, new Date()),
      ),
    });
    if (!invite?.supplierId || !invite.documentTypeIds?.length) {
      throw new ActionError("This link is no longer valid. Please ask our Purchasing team for a new link.");
    }
    const supplierId = invite.supplierId;

    const types = await db.select().from(documentTypes).where(inArray(documentTypes.id, invite.documentTypeIds));
    const uploads: { typeId: string; typeName: string; ref: UploadRef; expiresOn: string | null }[] = [];
    const fieldErrors: Record<string, string[]> = {};
    for (const t of types) {
      const ref = readUploadRef(formData, `doc:${t.id}`);
      const expiresOn = formData.get(`exp:${t.id}`)?.toString() || null;
      if (!ref) fieldErrors[`doc:${t.id}`] = [`Please upload the corrected ${t.name}.`];
      if (ref && t.hasExpiry && !expiresOn) fieldErrors[`exp:${t.id}`] = ["Enter the expiry date."];
      if (ref) uploads.push({ typeId: t.id, typeName: t.name, ref, expiresOn: t.hasExpiry ? expiresOn : null });
    }
    if (Object.keys(fieldErrors).length) return { error: "Please upload every requested document.", fieldErrors };

    const stored: (typeof uploads[number] & Awaited<ReturnType<typeof confirmUpload>>)[] = [];
    for (const u of uploads) stored.push({ ...u, ...(await confirmUpload(supplierId, u.ref)) });

    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(supplierInvites)
        .set({ submittedAt: new Date() })
        .where(and(eq(supplierInvites.id, invite.id), isNull(supplierInvites.submittedAt)))
        .returning({ id: supplierInvites.id });
      if (!claimed.length) throw new ActionError("These documents were already submitted.");

      for (const s of stored) {
        await tx
          .update(supplierDocuments)
          .set({ isCurrent: false })
          .where(and(eq(supplierDocuments.supplierId, supplierId), eq(supplierDocuments.documentTypeId, s.typeId)));
        const [doc] = await tx
          .insert(supplierDocuments)
          .values({
            supplierId,
            documentTypeId: s.typeId,
            storagePath: s.path,
            fileName: s.fileName,
            fileSize: s.fileSize,
            mimeType: s.mimeType,
            expiresOn: s.expiresOn,
          })
          .returning({ id: supplierDocuments.id });
        await recordEvent(tx, {
          entityType: "document",
          entityId: doc.id,
          supplierId,
          action: "uploaded",
          actorLabel: "Supplier (re-upload link)",
          note: `${s.typeName}: ${s.fileName}`,
        });
      }
    });
  });
  if (result.error) return result;
  redirect(`/register/${token}/done?reupload=1`);
}
