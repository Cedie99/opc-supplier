import "server-only";
import { sql } from "drizzle-orm";
import { materialCategories, supplierCategories, suppliers } from "@/lib/db/schema";
import { nextReferences, recordEvents, type Tx } from "@/lib/audit";
import { checkImportRows, type CheckedRow, type ImportLookup, type RawImportRow } from "@/lib/supplier-import";

export async function loadImportLookup(tx: Tx): Promise<ImportLookup> {
  const [categories, existing] = await Promise.all([
    tx.select({ id: materialCategories.id, name: materialCategories.name }).from(materialCategories),
    tx.select({ code: suppliers.code, name: suppliers.name, tin: suppliers.tin, erpVendorCode: suppliers.erpVendorCode }).from(suppliers),
  ]);
  return { categories, existing };
}

/**
 * Registers every acceptable row as a new Prospect. Call inside a transaction. The rows are checked again here,
 * and imports take turns, so the same file submitted twice cannot create the same suppliers twice.
 */
export async function saveImportedSuppliers(tx: Tx, rows: RawImportRow[], userId: string, fileName: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('supplier-import'))`);
  const checked = checkImportRows(rows, await loadImportLookup(tx));
  const ready = checked.filter((row): row is CheckedRow & Required<Pick<CheckedRow, "details" | "categoryIds">> => row.status === "ready");
  if (!ready.length) return { checked, created: [] };

  const codes = await nextReferences(tx, "supplier", "SUP-", ready.length);
  const created = await tx
    .insert(suppliers)
    .values(ready.map((row, i) => ({ ...row.details, code: codes[i], status: "prospect" as const, createdBy: userId })))
    .returning({ id: suppliers.id, code: suppliers.code, name: suppliers.name });

  const idByCode = new Map(created.map((s) => [s.code, s.id]));
  const links = ready.flatMap((row, i) => row.categoryIds.map((categoryId) => ({ supplierId: idByCode.get(codes[i])!, categoryId })));
  if (links.length) await tx.insert(supplierCategories).values(links);

  await recordEvents(
    tx,
    ready.map((row, i) => {
      const id = idByCode.get(codes[i])!;
      return { entityType: "supplier", entityId: id, supplierId: id, action: "created", actorId: userId, note: `Imported from Excel as ${codes[i]} (${fileName}, row ${row.rowNumber})` };
    }),
  );
  return { checked, created };
}
