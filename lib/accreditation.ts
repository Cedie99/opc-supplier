import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentTypes, supplierDocuments } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";

export type DocumentChecklistItem = {
  type: typeof documentTypes.$inferSelect;
  document: typeof supplierDocuments.$inferSelect | null;
  state: "missing" | "pending" | "verified" | "rejected" | "expired";
};

export type Compliance = {
  items: DocumentChecklistItem[];
  /** Mandatory documents that are not verified and valid. Any of these blocks accreditation. */
  blocking: string[];
  mandatoryTotal: number;
  mandatoryOk: number;
};

/** The accreditation checklist for one supplier: each active document type and its current document. */
export async function getCompliance(supplierId: string): Promise<Compliance> {
  const [types, docs] = await Promise.all([
    db.select().from(documentTypes).where(eq(documentTypes.isActive, true)).orderBy(asc(documentTypes.sortOrder), asc(documentTypes.name)),
    db
      .select()
      .from(supplierDocuments)
      .where(and(eq(supplierDocuments.supplierId, supplierId), eq(supplierDocuments.isCurrent, true))),
  ]);
  const today = todayIso();
  const items: DocumentChecklistItem[] = types.map((type) => {
    const document = docs.find((d) => d.documentTypeId === type.id) ?? null;
    let state: DocumentChecklistItem["state"] = "missing";
    if (document) {
      if (document.expiresOn && document.expiresOn < today) state = "expired";
      else state = document.status;
    }
    return { type, document, state };
  });
  const mandatory = items.filter((i) => i.type.isMandatory);
  const blocking = mandatory.filter((i) => i.state !== "verified").map((i) => i.type.name);
  return { items, blocking, mandatoryTotal: mandatory.length, mandatoryOk: mandatory.length - blocking.length };
}
