import "server-only";
import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { auditEvents, counters } from "@/lib/db/schema";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;

export async function recordEvent(
  tx: Tx,
  event: {
    entityType: "supplier" | "document" | "canvass" | "evaluation" | "corrective_action" | "template" | "user" | "invite" | "request";
    entityId: string;
    supplierId?: string | null;
    action: string;
    actorId?: string | null;
    actorLabel?: string | null;
    note?: string | null;
    data?: Record<string, unknown>;
  },
) {
  await tx.insert(auditEvents).values({
    entityType: event.entityType,
    entityId: event.entityId,
    supplierId: event.supplierId ?? null,
    action: event.action,
    actorId: event.actorId ?? null,
    actorLabel: event.actorLabel ?? null,
    note: event.note ?? null,
    data: event.data,
  });
}

/** Atomically increments a counter and returns e.g. "CAR-2026-0007". */
export async function nextReference(tx: Tx, key: string, prefix: string, pad = 4): Promise<string> {
  const [row] = await tx
    .insert(counters)
    .values({ key, value: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  return `${prefix}${String(row.value).padStart(pad, "0")}`;
}
