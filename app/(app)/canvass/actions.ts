"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { canvassEntries, canvasses, suppliers } from "@/lib/db/schema";
import { authorize, ActionError } from "@/lib/auth";
import { formToObject, runAction, zRequired, zText, type ActionState } from "@/lib/actions";
import { nextReference, recordEvent } from "@/lib/audit";
import { getActiveTemplate, getTemplate } from "@/lib/templates";
import { getCompliance } from "@/lib/accreditation";
import { openCorrectiveActions } from "@/lib/corrective";
import { scoreCanvass } from "@/lib/scoring/canvass";
import { SUPPLIER_STATUS_LABELS, type Role } from "@/lib/constants";
import { canFill, mergeOwnedInputs } from "@/lib/scoring/ownership";


const createSchema = z.object({
  title: zRequired("Title"),
  categoryId: z.uuid().optional(),
  materialDescription: zText(1000),
});

export async function createCanvass(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const result = await runAction(async () => {
    const user = await authorize("prepareCanvass");
    const data = createSchema.parse(formToObject(formData));
    const supplierIds = z.array(z.uuid()).parse(formData.getAll("supplierIds").map(String));
    const template = await getActiveTemplate("selection", data.categoryId);
    if (!template) throw new ActionError("No active Selection Matrix template. An administrator must set one up in Settings.");
    id = await db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const reference = await nextReference(tx, `canvass-${year}`, `CNV-${year}-`, 3);
      const [row] = await tx
        .insert(canvasses)
        .values({ ...data, reference, templateId: template.id, createdBy: user.id })
        .returning({ id: canvasses.id });
      if (supplierIds.length) {
        await tx.insert(canvassEntries).values([...new Set(supplierIds)].map((supplierId) => ({ canvassId: row.id, supplierId })));
      }
      await recordEvent(tx, { entityType: "canvass", entityId: row.id, action: "created", actorId: user.id, note: `${reference} — ${data.title}` });
      return row.id;
    });
  });
  if (result.error) return result;
  revalidatePath("/canvass");
  redirect(`/canvass/${id}`);
}

async function loadEditable(canvassId: string) {
  const canvass = await db.query.canvasses.findFirst({ where: eq(canvasses.id, canvassId) });
  if (!canvass) throw new ActionError("Canvass not found.");
  if (canvass.status !== "draft" && canvass.status !== "returned") throw new ActionError("This canvass is no longer editable.");
  return canvass;
}

export async function addCanvassSupplier(canvassId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await authorize("prepareCanvass");
    await loadEditable(canvassId);
    const supplierId = z.uuid("Choose a supplier.").parse(formData.get("supplierId"));
    await db.insert(canvassEntries).values({ canvassId, supplierId }).onConflictDoNothing();
    revalidatePath(`/canvass/${canvassId}`);
    return { ok: true, message: "Supplier added." };
  });
}

export async function removeCanvassSupplier(canvassId: string, entryId: string): Promise<ActionState> {
  return runAction(async () => {
    await authorize("prepareCanvass");
    await loadEditable(canvassId);
    await db.delete(canvassEntries).where(and(eq(canvassEntries.id, entryId), eq(canvassEntries.canvassId, canvassId)));
    revalidatePath(`/canvass/${canvassId}`);
    return { ok: true, message: "Supplier removed." };
  });
}

const scoreInput = z.object({
  key: z.string().max(64),
  numerator: z.number().finite().nullable().optional(),
  denominator: z.number().finite().nullable().optional(),
  manualRating: z.number().int().min(1).max(5).nullable().optional(),
  isNa: z.boolean().optional(),
  overrideReason: z.string().max(1000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

const saveSchema = z.object({
  entries: z.array(
    z.object({
      id: z.uuid(),
      landedCost: z.number().positive().nullable(),
      quotationRef: z.string().max(200).nullable(),
      criticalSpecFailed: z.boolean(),
      notes: z.string().max(2000).nullable(),
      inputs: z.array(scoreInput).max(50),
    }),
  ),
  recommendedSupplierId: z.uuid().nullable(),
  recommendation: z.string().max(2000).nullable(),
});

/**
 * Scores all entries on the server (the client preview is never trusted) and stores the result.
 * Each role only changes the fields it owns: QA the sample results and critical-spec flag, Purchasing the rest.
 * Fields the user does not own keep their stored values, so a Buyer and QA saving the same canvass never
 * overwrite each other.
 */
async function computeAndStore(canvassId: string, templateId: string, role: Role, payload?: z.infer<typeof saveSchema>) {
  const template = await getTemplate(templateId);
  if (!template) throw new ActionError("Template not found.");
  const purchasing = canFill(role, "purchasing");
  const qa = canFill(role, "qa");
  const entries = await db.select().from(canvassEntries).where(eq(canvassEntries.canvassId, canvassId));
  const merged = entries.map((e) => {
    const p = payload?.entries.find((x) => x.id === e.id);
    if (!p) return e;
    const inputs = mergeOwnedInputs(template.criteria, "selection", role, p.inputs, e.inputs);
    return {
      ...e,
      landedCost: purchasing ? p.landedCost : e.landedCost,
      quotationRef: purchasing ? p.quotationRef : e.quotationRef,
      criticalSpecFailed: qa ? p.criticalSpecFailed : e.criticalSpecFailed,
      notes: p.notes,
      inputs,
    };
  });
  const compliance = await Promise.all(merged.map((e) => getCompliance(e.supplierId)));
  const scored = scoreCanvass(
    template.criteria,
    template.bands,
    merged.map((e, i) => ({
      id: e.id,
      supplierId: e.supplierId,
      landedCost: e.landedCost,
      criticalSpecFailed: e.criticalSpecFailed,
      blockingDocuments: compliance[i].blocking,
      inputs: e.inputs,
    })),
  );
  // Overriding a calculated rating needs a reason.
  for (const e of merged) {
    for (const input of e.inputs) {
      const criterion = template.criteria.find((c) => c.key === input.key);
      if (criterion && criterion.inputMode !== "manual" && input.manualRating && !input.overrideReason?.trim()) {
        throw new ActionError(`Give a reason for overriding the calculated ${criterion.name} rating.`);
      }
    }
  }
  await db.transaction(async (tx) => {
    for (const e of merged) {
      const r = scored.results.find((x) => x.id === e.id)!;
      await tx
        .update(canvassEntries)
        .set({
          landedCost: e.landedCost,
          quotationRef: e.quotationRef,
          criticalSpecFailed: e.criticalSpecFailed,
          notes: e.notes,
          inputs: e.inputs,
          totalScore: r.result.total,
          classification: r.result.classification,
        })
        .where(eq(canvassEntries.id, e.id));
    }
    if (payload && purchasing) {
      await tx
        .update(canvasses)
        .set({ recommendedSupplierId: payload.recommendedSupplierId, recommendation: payload.recommendation })
        .where(eq(canvasses.id, canvassId));
    }
  });
  return { template, scored };
}

export async function saveCanvass(canvassId: string, json: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("editCanvass");
    const canvass = await loadEditable(canvassId);
    const payload = saveSchema.parse(JSON.parse(json));
    await computeAndStore(canvassId, canvass.templateId, user.role, payload);
    revalidatePath(`/canvass/${canvassId}`);
    return { ok: true, message: "Saved." };
  });
}

export async function submitCanvass(canvassId: string, json: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("prepareCanvass");
    const canvass = await loadEditable(canvassId);
    const payload = saveSchema.parse(JSON.parse(json));
    const { scored } = await computeAndStore(canvassId, canvass.templateId, user.role, payload);

    if (scored.results.length < 2) throw new ActionError("Compare at least 2 suppliers before submitting.");
    const incomplete = scored.results.filter((r) => !r.result.complete);
    if (incomplete.length) throw new ActionError("Every supplier must be rated on every criterion before submitting.");
    if (!payload.recommendedSupplierId) throw new ActionError("Choose the supplier you recommend.");
    const chosen = scored.results.find((r) => r.supplierId === payload.recommendedSupplierId);
    if (!chosen) throw new ActionError("The recommended supplier is not part of this canvass.");
    if (chosen.blocked) throw new ActionError(`The recommended supplier cannot be selected: ${chosen.blockReasons.join("; ")}.`);
    if (chosen.result.classification === "not_qualified") throw new ActionError("The recommended supplier scored below 70% (Not Qualified).");
    if (scored.best && scored.best.supplierId !== chosen.supplierId && !payload.recommendation?.trim()) {
      throw new ActionError("You recommend a supplier that is not the highest scorer. Explain why in the recommendation.");
    }

    await db.transaction(async (tx) => {
      await tx.update(canvasses).set({ status: "submitted", submittedAt: new Date() }).where(eq(canvasses.id, canvassId));
      await recordEvent(tx, { entityType: "canvass", entityId: canvassId, action: "submitted", actorId: user.id, note: canvass.reference });
    });
    revalidatePath(`/canvass/${canvassId}`);
    revalidatePath("/canvass");
    return { ok: true, message: "Submitted for approval." };
  });
}

const decisionSchema = z.object({ decision: z.enum(["approve", "return"]), note: zText(2000) });

export async function decideCanvass(canvassId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("approve");
    const { decision, note } = decisionSchema.parse(formToObject(formData));
    const canvass = await db.query.canvasses.findFirst({ where: eq(canvasses.id, canvassId) });
    if (!canvass || canvass.status !== "submitted") throw new ActionError("This canvass is not waiting for approval.");
    if (canvass.createdBy === user.id && user.role !== "admin") throw new ActionError("You cannot approve a canvass you prepared.");

    if (decision === "return") {
      if (!note) return { error: "Please check the highlighted fields.", fieldErrors: { note: ["Say what needs to change."] } };
      await db.transaction(async (tx) => {
        await tx.update(canvasses).set({ status: "returned", decisionNote: note, decidedBy: user.id, decidedAt: new Date() }).where(eq(canvasses.id, canvassId));
        await recordEvent(tx, { entityType: "canvass", entityId: canvassId, action: "returned", actorId: user.id, note });
      });
      revalidatePath(`/canvass/${canvassId}`);
      return { ok: true, message: "Returned to the preparer." };
    }

    // Approve: re-check the selected supplier on the server, then accredit it.
    const { template, scored } = await computeAndStore(canvassId, canvass.templateId, user.role);
    const chosen = scored.results.find((r) => r.supplierId === canvass.recommendedSupplierId);
    if (!chosen || chosen.blocked || !chosen.result.complete || chosen.result.classification === "not_qualified") {
      throw new ActionError("The recommended supplier no longer qualifies (documents or score changed). Return the canvass instead.");
    }
    const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, chosen.supplierId) });
    if (!supplier) throw new ActionError("Supplier not found.");
    const classification = chosen.result.classification!;

    let cars: string[] = [];
    await db.transaction(async (tx) => {
      await tx.update(canvasses).set({ status: "approved", decisionNote: note ?? null, decidedBy: user.id, decidedAt: new Date() }).where(eq(canvasses.id, canvassId));
      // Only prospects / suppliers under review get their status from a canvass; accredited suppliers keep the
      // status from their quarterly evaluations.
      const isNew = supplier.status === "prospect" || supplier.status === "under_review" || supplier.status === "not_qualified";
      if (isNew) {
        await tx
          .update(suppliers)
          .set({ status: classification, latestScore: chosen.result.total, latestScoreAt: new Date(), accreditedAt: new Date() })
          .where(eq(suppliers.id, supplier.id));
        await recordEvent(tx, {
          entityType: "supplier",
          entityId: supplier.id,
          supplierId: supplier.id,
          action: "accredited",
          actorId: user.id,
          note: `${SUPPLIER_STATUS_LABELS[classification]} via ${canvass.reference} (${chosen.result.total}%)`,
        });
      }
      const below = chosen.result.criteria.filter((c) => c.rating !== null && c.rating < 3);
      if (below.length) {
        cars = await openCorrectiveActions(tx, {
          supplierId: supplier.id,
          source: `Selection Matrix ${canvass.reference}`,
          criteria: below.map((c) => ({ name: c.name, rating: c.rating, rawValue: c.rawValue })),
          actorId: user.id,
        });
      }
      await recordEvent(tx, {
        entityType: "canvass",
        entityId: canvassId,
        supplierId: supplier.id,
        action: "approved",
        actorId: user.id,
        note: `${canvass.reference}: ${supplier.name} selected (${template.name} v${template.version})${note ? ` — ${note}` : ""}`,
      });
    });
    revalidatePath(`/canvass/${canvassId}`);
    revalidatePath(`/suppliers/${supplier.id}`);
    return { ok: true, message: cars.length ? `Approved. Corrective actions opened: ${cars.join(", ")}.` : "Approved." };
  });
}

export async function cancelCanvass(canvassId: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("prepareCanvass");
    await loadEditable(canvassId);
    await db.transaction(async (tx) => {
      await tx.update(canvasses).set({ status: "cancelled" }).where(eq(canvasses.id, canvassId));
      await recordEvent(tx, { entityType: "canvass", entityId: canvassId, action: "cancelled", actorId: user.id });
    });
    revalidatePath(`/canvass/${canvassId}`);
    return { ok: true, message: "Canvass cancelled." };
  });
}

