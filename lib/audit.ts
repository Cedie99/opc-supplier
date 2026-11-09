import "server-only";
import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { auditEvents, counters } from "@/lib/db/schema";

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;

type AuditEvent = {
  entityType: "supplier" | "document" | "canvass" | "evaluation" | "corrective_action" | "template" | "user" | "invite" | "request";
  entityId: string;
  supplierId?: string | null;
  action: string;
  actorId?: string | null;
  actorLabel?: string | null;
  note?: string | null;
  data?: Record<string, unknown>;
};

export async function recordEvent(tx: Tx, event: AuditEvent) {
  await recordEvents(tx, [event]);
}

export async function recordEvents(tx: Tx, events: AuditEvent[]) {
  if (!events.length) return;
  await tx.insert(auditEvents).values(
    events.map((event) => ({
      entityType: event.entityType,
      entityId: event.entityId,
      supplierId: event.supplierId ?? null,
      action: event.action,
      actorId: event.actorId ?? null,
      actorLabel: event.actorLabel ?? null,
      note: event.note ?? null,
      data: event.data,
    })),
  );
}

/** Atomically increments a counter and returns e.g. "CAR-2026-0007". */
export async function nextReference(tx: Tx, key: string, prefix: string, pad = 4): Promise<string> {
  const [reference] = await nextReferences(tx, key, prefix, 1, pad);
  return reference;
}

/** Reserves a block of consecutive references in one step. */
export async function nextReferences(tx: Tx, key: string, prefix: string, count: number, pad = 4): Promise<string[]> {
  const [row] = await tx
    .insert(counters)
    .values({ key, value: count })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + ${count}` } })
    .returning({ value: counters.value });
  const first = row.value - count + 1;
  return Array.from({ length: count }, (_, i) => `${prefix}${String(first + i).padStart(pad, "0")}`);
}
