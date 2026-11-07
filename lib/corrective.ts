import "server-only";
import { addDays, format } from "date-fns";
import type { DB } from "@/lib/db";
import { correctiveActions } from "@/lib/db/schema";
import { nextReference, recordEvent } from "@/lib/audit";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Default time a supplier gets to close a corrective action. */
export const CORRECTIVE_ACTION_DAYS = 30;

/** Opens one corrective action per criterion rated below 3 (the rule in the evaluation policy). */
export async function openCorrectiveActions(
  tx: Tx,
  opts: {
    supplierId: string;
    evaluationId?: string | null;
    source: string;
    criteria: { name: string; rating: number | null; rawValue?: number | null }[];
    actorId: string;
  },
) {
  const created: string[] = [];
  const year = new Date().getFullYear();
  for (const c of opts.criteria) {
    const reference = await nextReference(tx, `car-${year}`, `CAR-${year}-`, 3);
    const [row] = await tx
      .insert(correctiveActions)
      .values({
        reference,
        supplierId: opts.supplierId,
        evaluationId: opts.evaluationId ?? null,
        criterion: c.name,
        issue: `${c.name} rated ${c.rating} of 5 in ${opts.source}${c.rawValue != null ? ` (measured value ${c.rawValue})` : ""}. An improvement plan is required.`,
        dueDate: format(addDays(new Date(), CORRECTIVE_ACTION_DAYS), "yyyy-MM-dd"),
        createdBy: opts.actorId,
      })
      .returning({ id: correctiveActions.id });
    await recordEvent(tx, {
      entityType: "corrective_action",
      entityId: row.id,
      supplierId: opts.supplierId,
      action: "opened",
      actorId: opts.actorId,
      note: `${reference} — ${c.name}`,
    });
    created.push(reference);
  }
  return created;
}
