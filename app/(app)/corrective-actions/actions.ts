"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { correctiveActions } from "@/lib/db/schema";
import { authorize, ActionError } from "@/lib/auth";
import { formToObject, runAction, zRequired, zText, type ActionState } from "@/lib/actions";
import { nextReference, recordEvent } from "@/lib/audit";
import { CA_STATUS_LABELS } from "@/lib/constants";

const createSchema = z.object({
  supplierId: z.uuid("Choose a supplier."),
  criterion: zText(200),
  issue: zRequired("Issue", 2000),
  dueDate: z.iso.date("Enter the due date."),
  ownerId: z.uuid().optional(),
  supplierContact: zText(200),
});

export async function createCorrectiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const result = await runAction(async () => {
    const user = await authorize("manageCorrectiveActions");
    const data = createSchema.parse(formToObject(formData));
    id = await db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const reference = await nextReference(tx, `car-${year}`, `CAR-${year}-`, 3);
      const [row] = await tx.insert(correctiveActions).values({ ...data, reference, createdBy: user.id }).returning({ id: correctiveActions.id });
      await recordEvent(tx, { entityType: "corrective_action", entityId: row.id, supplierId: data.supplierId, action: "opened", actorId: user.id, note: reference });
      return row.id;
    });
  });
  if (result.error) return result;
  revalidatePath("/corrective-actions");
  redirect(`/corrective-actions/${id}`);
}

const updateSchema = z.object({
  rootCause: zText(4000),
  actionPlan: zText(4000),
  ownerId: z.uuid().optional(),
  supplierContact: zText(200),
  dueDate: z.iso.date("Enter the due date."),
  status: z.enum(["open", "in_progress", "for_verification"]),
});

export async function updateCorrectiveAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("manageCorrectiveActions");
    const data = updateSchema.parse(formToObject(formData));
    const current = await db.query.correctiveActions.findFirst({ where: eq(correctiveActions.id, id) });
    if (!current) throw new ActionError("Corrective action not found.");
    if (current.status === "closed") throw new ActionError("This corrective action is closed.");
    if (data.status === "for_verification" && (!data.rootCause || !data.actionPlan)) {
      return {
        error: "Fill in the root cause and action plan before sending it for verification.",
        fieldErrors: { ...(data.rootCause ? {} : { rootCause: ["Required"] }), ...(data.actionPlan ? {} : { actionPlan: ["Required"] }) },
      };
    }
    await db.transaction(async (tx) => {
      await tx
        .update(correctiveActions)
        .set({ ...data, ownerId: data.ownerId ?? null })
        .where(eq(correctiveActions.id, id));
      await recordEvent(tx, {
        entityType: "corrective_action",
        entityId: id,
        supplierId: current.supplierId,
        action: "updated",
        actorId: user.id,
        note: current.status !== data.status ? `${CA_STATUS_LABELS[current.status]} → ${CA_STATUS_LABELS[data.status]}` : undefined,
      });
    });
    revalidatePath(`/corrective-actions/${id}`);
    return { ok: true, message: "Saved." };
  });
}

const closeSchema = z.object({ closureNote: zRequired("Closure note", 4000) });

/** Closing confirms the action worked. Only QA or an approver can close. */
export async function closeCorrectiveAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("manageCorrectiveActions");
    if (!["admin", "purchasing_manager", "qa_officer"].includes(user.role)) throw new ActionError("Only a Purchasing Officer or the Purchasing Manager can close a corrective action.");
    const { closureNote } = closeSchema.parse(formToObject(formData));
    const current = await db.query.correctiveActions.findFirst({ where: eq(correctiveActions.id, id) });
    if (!current) throw new ActionError("Corrective action not found.");
    if (current.status === "closed") throw new ActionError("Already closed.");
    if (!current.rootCause || !current.actionPlan) throw new ActionError("Record the root cause and action plan before closing.");
    await db.transaction(async (tx) => {
      await tx.update(correctiveActions).set({ status: "closed", closureNote, closedAt: new Date(), closedBy: user.id }).where(eq(correctiveActions.id, id));
      await recordEvent(tx, { entityType: "corrective_action", entityId: id, supplierId: current.supplierId, action: "closed", actorId: user.id, note: closureNote });
    });
    revalidatePath(`/corrective-actions/${id}`);
    revalidatePath("/corrective-actions");
    return { ok: true, message: "Corrective action closed." };
  });
}
