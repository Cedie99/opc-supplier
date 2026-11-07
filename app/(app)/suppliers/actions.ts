"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { addDays } from "date-fns";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  communicationLogs,
  complaints,
  documentTypes,
  supplierCategories,
  supplierDocuments,
  supplierInvites,
  suppliers,
} from "@/lib/db/schema";
import { authorize, ActionError } from "@/lib/auth";
import { runAction, formToObject, parseLocalDateTime, zBool, zText, zRequired, type ActionState } from "@/lib/actions";
import { nextReference, recordEvent } from "@/lib/audit";
import { uploadSupplierFile } from "@/lib/storage";
import { getCompliance } from "@/lib/accreditation";
import { appUrl } from "@/lib/env";
import { deliveryNote, queueEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates";
import { fmtDateTime } from "@/lib/format";
import { MOLD_OWNERSHIP, REQUEST_TYPES, SUPPLIER_STATUSES, SUPPLIER_TIERS, SUPPLIER_STATUS_LABELS } from "@/lib/constants";

const optionalInt = z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(0).max(100000).optional());

const supplierSchema = z.object({
  name: zRequired("Company name"),
  tradeName: zText(200),
  contactPerson: zText(200),
  email: z.email("Enter a valid email.").optional(),
  phone: zText(100),
  address: zText(500),
  tin: zText(50),
  website: zText(300),
  yearEstablished: z.preprocess(
    (v) => (v === undefined ? undefined : Number(v)),
    z.number().int().min(1800, "Enter a valid year.").max(new Date().getFullYear(), "Enter a valid year.").optional(),
  ),
  creditTermsDays: optionalInt,
  tier: z.enum(SUPPLIER_TIERS),
  isSingleSource: zBool,
  moldOwnership: z.enum(MOLD_OWNERSHIP),
  erpVendorCode: zText(50),
  notes: zText(2000),
});

/** Reads the category checkboxes (name="categoryIds") and their material notes (name="materials:<id>"). */
function readCategories(formData: FormData) {
  const ids = formData.getAll("categoryIds").map(String).filter(Boolean);
  return ids.map((categoryId) => ({
    categoryId: z.uuid().parse(categoryId),
    materials: (formData.get(`materials:${categoryId}`)?.toString().trim() || null)?.slice(0, 500) ?? null,
  }));
}

export async function createSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let newId = "";
  const result = await runAction(async () => {
    const user = await authorize("manageSuppliers");
    const data = supplierSchema.parse(formToObject(formData));
    const categories = readCategories(formData);
    newId = await db.transaction(async (tx) => {
      const code = await nextReference(tx, "supplier", "SUP-");
      const [row] = await tx
        .insert(suppliers)
        .values({ ...data, code, status: "prospect", createdBy: user.id })
        .returning({ id: suppliers.id });
      if (categories.length) await tx.insert(supplierCategories).values(categories.map((c) => ({ ...c, supplierId: row.id })));
      await recordEvent(tx, { entityType: "supplier", entityId: row.id, supplierId: row.id, action: "created", actorId: user.id, note: `Registered as ${code}` });
      return row.id;
    });
  });
  if (result.error) return result;
  revalidatePath("/suppliers");
  redirect(`/suppliers/${newId}`);
}

export async function updateSupplier(supplierId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("manageSuppliers");
    const data = supplierSchema.parse(formToObject(formData));
    const categories = readCategories(formData);
    await db.transaction(async (tx) => {
      await tx.update(suppliers).set(data).where(eq(suppliers.id, supplierId));
      await tx.delete(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));
      if (categories.length) await tx.insert(supplierCategories).values(categories.map((c) => ({ ...c, supplierId })));
      await recordEvent(tx, { entityType: "supplier", entityId: supplierId, supplierId, action: "updated", actorId: user.id });
    });
    revalidatePath(`/suppliers/${supplierId}`);
    return { ok: true, message: "Supplier details saved." };
  });
}

const statusSchema = z.object({
  status: z.enum(SUPPLIER_STATUSES),
  note: z.string({ error: "Give a reason for the change." }).min(5, "Give a reason for the change.").max(1000),
});

/** Manual status change by an approver (e.g. deactivate, or reinstate after review). Always needs a reason. */
export async function changeSupplierStatus(supplierId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("approve");
    const { status, note } = statusSchema.parse(formToObject(formData));
    if (["preferred", "approved", "conditional"].includes(status)) {
      const compliance = await getCompliance(supplierId);
      if (compliance.blocking.length) {
        throw new ActionError(`Cannot accredit: mandatory documents not verified — ${compliance.blocking.join(", ")}.`);
      }
    }
    const current = await db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId), columns: { status: true } });
    if (!current) throw new ActionError("Supplier not found.");
    await db.transaction(async (tx) => {
      await tx
        .update(suppliers)
        .set({ status, ...(["preferred", "approved", "conditional"].includes(status) ? { accreditedAt: new Date() } : {}) })
        .where(eq(suppliers.id, supplierId));
      await recordEvent(tx, {
        entityType: "supplier",
        entityId: supplierId,
        supplierId,
        action: "status_changed",
        actorId: user.id,
        note: `${SUPPLIER_STATUS_LABELS[current.status]} → ${SUPPLIER_STATUS_LABELS[status]}: ${note}`,
      });
    });
    revalidatePath(`/suppliers/${supplierId}`);
    revalidatePath("/suppliers");
    return { ok: true, message: "Status updated." };
  });
}

// ─── Documents ───────────────────────────────────────────────────────────────

const uploadSchema = z.object({
  documentTypeId: z.uuid("Choose the document type."),
  issuedOn: z.iso.date().optional(),
  expiresOn: z.iso.date().optional(),
});

export async function uploadDocument(supplierId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("uploadDocuments");
    const data = uploadSchema.parse(formToObject(formData));
    const type = await db.query.documentTypes.findFirst({ where: eq(documentTypes.id, data.documentTypeId) });
    if (!type) throw new ActionError("Unknown document type.");
    if (type.hasExpiry && !data.expiresOn) {
      return { error: "Please check the highlighted fields.", fieldErrors: { expiresOn: [`${type.name} needs an expiry date.`] } };
    }
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ActionError("Choose a file to upload.");
    const stored = await uploadSupplierFile(supplierId, file);

    await db.transaction(async (tx) => {
      await tx
        .update(supplierDocuments)
        .set({ isCurrent: false })
        .where(and(eq(supplierDocuments.supplierId, supplierId), eq(supplierDocuments.documentTypeId, type.id)));
      const [doc] = await tx
        .insert(supplierDocuments)
        .values({
          supplierId,
          documentTypeId: type.id,
          storagePath: stored.path,
          fileName: stored.fileName,
          fileSize: stored.fileSize,
          mimeType: stored.mimeType,
          issuedOn: data.issuedOn,
          expiresOn: type.hasExpiry ? data.expiresOn : null,
          uploadedBy: user.id,
        })
        .returning({ id: supplierDocuments.id });
      await recordEvent(tx, { entityType: "document", entityId: doc.id, supplierId, action: "uploaded", actorId: user.id, note: `${type.name}: ${stored.fileName}` });
    });
    revalidatePath(`/suppliers/${supplierId}`);
    return { ok: true, message: `${type.name} uploaded. It now needs to be verified.` };
  });
}

const reviewSchema = z.object({
  decision: z.enum(["verified", "rejected"]),
  reviewNote: zText(1000),
});

export async function reviewDocument(documentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("verifyDocuments");
    const { decision, reviewNote } = reviewSchema.parse(formToObject(formData));
    if (decision === "rejected" && !reviewNote) {
      return { error: "Please check the highlighted fields.", fieldErrors: { reviewNote: ["Say why the document is rejected."] } };
    }
    const doc = await db.query.supplierDocuments.findFirst({ where: eq(supplierDocuments.id, documentId), with: { documentType: true } });
    if (!doc) throw new ActionError("Document not found.");
    await db.transaction(async (tx) => {
      await tx
        .update(supplierDocuments)
        .set({ status: decision, reviewNote: reviewNote ?? null, reviewedBy: user.id, reviewedAt: new Date() })
        .where(eq(supplierDocuments.id, documentId));
      await recordEvent(tx, {
        entityType: "document",
        entityId: documentId,
        supplierId: doc.supplierId,
        action: decision,
        actorId: user.id,
        note: `${doc.documentType.name}${reviewNote ? `: ${reviewNote}` : ""}`,
      });
    });
    revalidatePath(`/suppliers/${doc.supplierId}`);
    revalidatePath("/documents");
    return { ok: true, message: decision === "verified" ? "Document verified." : "Document rejected." };
  });
}

// ─── Registration links ──────────────────────────────────────────────────────

const inviteSchema = z.object({ email: z.email("Enter a valid email.").optional() });

/** Creates a 14-day link the supplier can use to submit its details and documents. */
export async function createInvite(supplierId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("inviteSuppliers");
    const { email } = inviteSchema.parse(formToObject(formData));
    const token = randomBytes(24).toString("base64url");
    await db.transaction(async (tx) => {
      const [invite] = await tx
        .insert(supplierInvites)
        .values({ token, supplierId, email, expiresAt: addDays(new Date(), 14), createdBy: user.id })
        .returning({ id: supplierInvites.id });
      await recordEvent(tx, { entityType: "invite", entityId: invite.id, supplierId, action: "invite_created", actorId: user.id, note: email ? `For ${email}` : undefined });
    });
    const link = `${appUrl()}/register/${token}`;
    let note = "Link created.";
    if (email && formData.get("sendEmail") === "on") {
      const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId), columns: { name: true, contactPerson: true } });
      const sent = await queueEmail({
        to: email,
        replyTo: user.email,
        subject: "Supplier accreditation — please complete your registration",
        ...renderEmail({
          preheader: "Oracle Petroleum invites you to complete your supplier registration.",
          heading: "Please complete your supplier registration",
          paragraphs: [
            `Hello${supplier?.contactPerson ? ` ${supplier.contactPerson}` : ""},`,
            `${user.fullName} from Oracle Petroleum Purchasing invites ${supplier?.name ?? "your company"} to complete its supplier registration. Please fill in your company details and upload the requested documents (permits, BIR registration and others).`,
          ],
          button: { label: "Start registration", url: link },
          footnote: `The link works once, until ${fmtDateTime(addDays(new Date(), 14))}.`,
        }),
        relatedType: "invite",
        supplierId,
        createdBy: user.id,
      });
      note = `Link created. ${deliveryNote(sent.status)}`;
    }
    revalidatePath(`/suppliers/${supplierId}`);
    return { ok: true, message: note, link };
  });
}

/**
 * Creates a 14-day link that asks the supplier to upload only the chosen documents again (rejected, expired or
 * missing ones). It does not show the company form. Older unused re-upload links for this supplier stop working.
 */
export async function createResubmissionLink(supplierId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("inviteSuppliers");
    const { email } = inviteSchema.parse(formToObject(formData));
    const requested = new Set(formData.getAll("documentTypeId").map(String));
    const compliance = await getCompliance(supplierId);
    const chosen = compliance.items.filter((i) => requested.has(i.type.id) && i.state !== "verified" && i.state !== "pending");
    if (!chosen.length) {
      return { error: "Please check the highlighted fields.", fieldErrors: { documentTypeId: ["Choose at least one document to request."] } };
    }
    const token = randomBytes(24).toString("base64url");
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(supplierInvites)
        .set({ expiresAt: now })
        .where(
          and(
            eq(supplierInvites.supplierId, supplierId),
            eq(supplierInvites.purpose, "resubmission"),
            isNull(supplierInvites.submittedAt),
            gt(supplierInvites.expiresAt, now),
          ),
        );
      const [invite] = await tx
        .insert(supplierInvites)
        .values({
          token,
          supplierId,
          email,
          purpose: "resubmission",
          documentTypeIds: chosen.map((i) => i.type.id),
          expiresAt: addDays(now, 14),
          createdBy: user.id,
        })
        .returning({ id: supplierInvites.id });
      await recordEvent(tx, {
        entityType: "invite",
        entityId: invite.id,
        supplierId,
        action: "resubmission_requested",
        actorId: user.id,
        note: chosen.map((i) => i.type.name).join(", "),
      });
    });
    const link = `${appUrl()}/register/${token}`;
    let note = "Link created.";
    if (email && formData.get("sendEmail") === "on") {
      const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId), columns: { name: true, contactPerson: true } });
      const sent = await queueEmail({
        to: email,
        replyTo: user.email,
        subject: "Supplier accreditation — please upload corrected documents",
        ...renderEmail({
          preheader: "Some of your documents need to be uploaded again.",
          heading: "Please upload these documents again",
          paragraphs: [
            `Hello${supplier?.contactPerson ? ` ${supplier.contactPerson}` : ""},`,
            `Our QA team could not accept some of ${supplier?.name ?? "your company"}'s documents. Please upload a corrected file for each one using the button. The reasons are shown on the upload page.`,
          ],
          details: chosen.map((i) => ({ label: i.type.name, value: i.state === "rejected" ? `Rejected${i.document?.reviewNote ? `: ${i.document.reviewNote}` : ""}` : i.state === "expired" ? "Expired" : "Not received" })),
          button: { label: "Upload documents", url: link },
          footnote: `The link works once, until ${fmtDateTime(addDays(now, 14))}.`,
        }),
        relatedType: "resubmission",
        supplierId,
        createdBy: user.id,
      });
      note = `Link created. ${deliveryNote(sent.status)}`;
    }
    revalidatePath(`/suppliers/${supplierId}`);
    return { ok: true, message: note, link };
  });
}

// ─── Activity logs ───────────────────────────────────────────────────────────

const commSchema = z.object({
  requestType: z.enum(REQUEST_TYPES),
  subject: zRequired("Subject", 300),
  requestedAt: z.string({ error: "Enter when the request was sent." }),
  respondedAt: z.string().optional(),
  tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
});

export async function logCommunication(supplierId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("logActivity");
    const parsed = commSchema.parse(formToObject(formData));
    const data = {
      requestType: parsed.requestType,
      subject: parsed.subject,
      requestedAt: parseLocalDateTime(parsed.requestedAt, parsed.tzOffset),
      respondedAt: parsed.respondedAt ? parseLocalDateTime(parsed.respondedAt, parsed.tzOffset) : null,
    };
    if (data.respondedAt && data.respondedAt < data.requestedAt) {
      return { error: "Please check the highlighted fields.", fieldErrors: { respondedAt: ["The reply cannot be before the request."] } };
    }
    await db.insert(communicationLogs).values({ ...data, supplierId, loggedBy: user.id, channel: "manual", status: data.respondedAt ? "responded" : "open", respondedVia: data.respondedAt ? "other" : null });
    revalidatePath(`/suppliers/${supplierId}`);
    return { ok: true, message: "Request logged." };
  });
}

const complaintSchema = z.object({
  description: zRequired("Description", 2000),
  raisedOn: z.iso.date("Enter the date raised."),
  dueOn: z.iso.date("Enter the agreed resolution date."),
});

export async function logComplaint(supplierId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("logActivity");
    const data = complaintSchema.parse(formToObject(formData));
    if (data.dueOn < data.raisedOn) {
      return { error: "Please check the highlighted fields.", fieldErrors: { dueOn: ["The due date cannot be before the date raised."] } };
    }
    await db.insert(complaints).values({ ...data, supplierId, loggedBy: user.id });
    revalidatePath(`/suppliers/${supplierId}`);
    return { ok: true, message: "Complaint logged." };
  });
}

const resolveSchema = z.object({ resolvedOn: z.iso.date("Enter the resolution date."), resolution: zText(2000) });

export async function resolveComplaint(complaintId: string, supplierId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await authorize("logActivity");
    const data = resolveSchema.parse(formToObject(formData));
    await db
      .update(complaints)
      .set({ ...data, status: "resolved" })
      .where(and(eq(complaints.id, complaintId), eq(complaints.supplierId, supplierId)));
    revalidatePath(`/suppliers/${supplierId}`);
    return { ok: true, message: "Complaint resolved." };
  });
}
