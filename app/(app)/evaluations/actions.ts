"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { evaluations, supplierCategories, suppliers } from "@/lib/db/schema";
import { authorize, ActionError } from "@/lib/auth";
import { formToObject, runAction, zText, type ActionState } from "@/lib/actions";
import { recordEvent } from "@/lib/audit";
import { getActiveTemplate, getTemplate } from "@/lib/templates";
import { openCorrectiveActions } from "@/lib/corrective";
import { scoreSupplier } from "@/lib/scoring/engine";
import { ACCREDITED_STATUSES, SUPPLIER_STATUS_LABELS } from "@/lib/constants";
import { quarterLabel } from "@/lib/format";
import { mergeOwnedInputs } from "@/lib/scoring/ownership";

const periodSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  quarter: z.coerce.number().int().min(1).max(4),
});

async function templateForSupplier(supplierId: string) {
  const cats = await db
    .select({ categoryId: supplierCategories.categoryId })
    .from(supplierCategories)
    .where(eq(supplierCategories.supplierId, supplierId))
    .orderBy(asc(supplierCategories.categoryId));
  // A supplier with one category uses that category's template if there is one.
  return getActiveTemplate("quarterly", cats.length === 1 ? cats[0].categoryId : null);
}

export async function createEvaluation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const result = await runAction(async () => {
    const user = await authorize("prepareEvaluation");
    const { year, quarter } = periodSchema.parse(formToObject(formData));
    const supplierId = z.uuid("Choose a supplier.").parse(formData.get("supplierId"));
    const existing = await db.query.evaluations.findFirst({
      where: and(eq(evaluations.supplierId, supplierId), eq(evaluations.year, year), eq(evaluations.quarter, quarter)),
    });
    if (existing) {
      id = existing.id;
      return;
    }
    const template = await templateForSupplier(supplierId);
    if (!template) throw new ActionError("No active quarterly template. An administrator must set one up in Settings.");
    const [row] = await db
      .insert(evaluations)
      .values({ supplierId, year, quarter, templateId: template.id, evaluatorId: user.id })
      .returning({ id: evaluations.id });
    await recordEvent(db, { entityType: "evaluation", entityId: row.id, supplierId, action: "created", actorId: user.id, note: quarterLabel(year, quarter) });
    id = row.id;
  });
  if (result.error) return result;
  redirect(`/evaluations/${id}`);
}

/** Creates draft evaluations for every accredited supplier that is due this quarter. */
export async function generateEvaluations(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("prepareEvaluation");
    const { year, quarter } = periodSchema.parse(formToObject(formData));
    // Critical and high-spend suppliers every quarter; standard suppliers once a year (in Q4).
    const tiers = quarter === 4 ? (["critical", "high", "standard"] as const) : (["critical", "high"] as const);
    const due = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(inArray(suppliers.status, ACCREDITED_STATUSES), inArray(suppliers.tier, [...tiers])));
    const existing = await db
      .select({ supplierId: evaluations.supplierId })
      .from(evaluations)
      .where(and(eq(evaluations.year, year), eq(evaluations.quarter, quarter)));
    const have = new Set(existing.map((e) => e.supplierId));
    const todo = due.filter((s) => !have.has(s.id));
    let created = 0;
    for (const s of todo) {
      const template = await templateForSupplier(s.id);
      if (!template) throw new ActionError("No active quarterly template. An administrator must set one up in Settings.");
      const [row] = await db
        .insert(evaluations)
        .values({ supplierId: s.id, year, quarter, templateId: template.id })
        .onConflictDoNothing()
        .returning({ id: evaluations.id });
      if (row) {
        created++;
        await recordEvent(db, { entityType: "evaluation", entityId: row.id, supplierId: s.id, action: "created", actorId: user.id, note: `${quarterLabel(year, quarter)} (batch)` });
      }
    }
    revalidatePath("/evaluations");
    return {
      ok: true,
      message: created ? `Created ${created} draft evaluation(s) for ${quarterLabel(year, quarter)}.` : `Every due supplier already has a ${quarterLabel(year, quarter)} evaluation.`,
    };
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
const saveSchema = z.object({ inputs: z.array(scoreInput).max(50), comments: z.string().max(4000).nullable() });

async function loadEditable(id: string) {
  const evaluation = await db.query.evaluations.findFirst({ where: eq(evaluations.id, id) });
  if (!evaluation) throw new ActionError("Evaluation not found.");
  if (evaluation.status !== "draft" && evaluation.status !== "returned") throw new ActionError("This evaluation is no longer editable.");
  const template = await getTemplate(evaluation.templateId);
  if (!template) throw new ActionError("Template not found.");
  return { evaluation, template };
}

function score(template: NonNullable<Awaited<ReturnType<typeof getTemplate>>>, inputs: z.infer<typeof scoreInput>[]) {
  for (const input of inputs) {
    const c = template.criteria.find((x) => x.key === input.key);
    if (c && c.inputMode !== "manual" && input.manualRating && !input.overrideReason?.trim()) {
      throw new ActionError(`Give a reason for overriding the calculated ${c.name} rating.`);
    }
  }
  return scoreSupplier(template.criteria, inputs, template.bands);
}

export async function saveEvaluation(id: string, json: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("editEvaluation");
    const { evaluation, template } = await loadEditable(id);
    const data = saveSchema.parse(JSON.parse(json));
    // Each role only changes the criteria it owns; the rest keep their stored values.
    const inputs = mergeOwnedInputs(template.criteria, "quarterly", user.role, data.inputs, evaluation.inputs);
    const result = score(template, inputs);
    await db
      .update(evaluations)
      .set({ inputs, comments: data.comments, totalScore: result.total, classification: result.classification, evaluatorId: evaluation.evaluatorId ?? user.id })
      .where(eq(evaluations.id, id));
    revalidatePath(`/evaluations/${id}`);
    return { ok: true, message: "Saved." };
  });
}

export async function submitEvaluation(id: string, json: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("prepareEvaluation");
    const { evaluation, template } = await loadEditable(id);
    const data = saveSchema.parse(JSON.parse(json));
    const inputs = mergeOwnedInputs(template.criteria, "quarterly", user.role, data.inputs, evaluation.inputs);
    const result = score(template, inputs);
    if (!result.complete) throw new ActionError(`Rate every criterion before submitting. Missing: ${result.missing.join(", ")}.`);
    await db.transaction(async (tx) => {
      await tx
        .update(evaluations)
        .set({
          inputs,
          comments: data.comments,
          totalScore: result.total,
          classification: result.classification,
          status: "submitted",
          submittedAt: new Date(),
          evaluatorId: user.id,
        })
        .where(eq(evaluations.id, id));
      await recordEvent(tx, {
        entityType: "evaluation",
        entityId: id,
        supplierId: evaluation.supplierId,
        action: "submitted",
        actorId: user.id,
        note: `${quarterLabel(evaluation.year, evaluation.quarter)}: ${result.total}%`,
      });
    });
    revalidatePath(`/evaluations/${id}`);
    revalidatePath("/evaluations");
    return { ok: true, message: "Submitted for approval." };
  });
}

const decisionSchema = z.object({ decision: z.enum(["approve", "return"]), note: zText(2000) });

export async function decideEvaluation(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("approve");
    const { decision, note } = decisionSchema.parse(formToObject(formData));
    const evaluation = await db.query.evaluations.findFirst({ where: eq(evaluations.id, id) });
    if (!evaluation || evaluation.status !== "submitted") throw new ActionError("This evaluation is not waiting for approval.");
    if (evaluation.evaluatorId === user.id && user.role !== "admin") throw new ActionError("You cannot approve an evaluation you prepared.");
    const period = quarterLabel(evaluation.year, evaluation.quarter);

    if (decision === "return") {
      if (!note) return { error: "Please check the highlighted fields.", fieldErrors: { note: ["Say what needs to change."] } };
      await db.transaction(async (tx) => {
        await tx.update(evaluations).set({ status: "returned", decisionNote: note, approverId: user.id }).where(eq(evaluations.id, id));
        await recordEvent(tx, { entityType: "evaluation", entityId: id, supplierId: evaluation.supplierId, action: "returned", actorId: user.id, note });
      });
      revalidatePath(`/evaluations/${id}`);
      return { ok: true, message: "Returned to the evaluator." };
    }

    const template = await getTemplate(evaluation.templateId);
    if (!template) throw new ActionError("Template not found.");
    const result = scoreSupplier(template.criteria, evaluation.inputs, template.bands);
    if (!result.complete || !result.classification) throw new ActionError("The evaluation is incomplete.");
    const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, evaluation.supplierId) });
    if (!supplier) throw new ActionError("Supplier not found.");

    let cars: string[] = [];
    await db.transaction(async (tx) => {
      await tx
        .update(evaluations)
        .set({ status: "approved", approverId: user.id, approvedAt: new Date(), decisionNote: note ?? null, totalScore: result.total, classification: result.classification })
        .where(eq(evaluations.id, id));
      const newStatus = supplier.status === "inactive" ? "inactive" : result.classification!;
      await tx.update(suppliers).set({ status: newStatus, latestScore: result.total, latestScoreAt: new Date() }).where(eq(suppliers.id, supplier.id));
      if (newStatus !== supplier.status) {
        await recordEvent(tx, {
          entityType: "supplier",
          entityId: supplier.id,
          supplierId: supplier.id,
          action: "status_changed",
          actorId: user.id,
          note: `${SUPPLIER_STATUS_LABELS[supplier.status]} → ${SUPPLIER_STATUS_LABELS[newStatus]} after ${period} evaluation (${result.total}%)`,
        });
      }
      const below = result.criteria.filter((c) => c.rating !== null && c.rating < 3);
      if (below.length) {
        cars = await openCorrectiveActions(tx, {
          supplierId: supplier.id,
          evaluationId: id,
          source: `the ${period} evaluation`,
          criteria: below.map((c) => ({ name: c.name, rating: c.rating, rawValue: c.rawValue })),
          actorId: user.id,
        });
      }
      await recordEvent(tx, { entityType: "evaluation", entityId: id, supplierId: supplier.id, action: "approved", actorId: user.id, note: `${period}: ${result.total}%${note ? ` — ${note}` : ""}` });
    });
    revalidatePath(`/evaluations/${id}`);
    revalidatePath(`/suppliers/${supplier.id}`);
    return { ok: true, message: cars.length ? `Approved. Supplier concerns opened: ${cars.join(", ")}.` : "Approved." };
  });
}
