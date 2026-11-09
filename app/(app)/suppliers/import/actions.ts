"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize, ActionError } from "@/lib/auth";
import { loadImportLookup, saveImportedSuppliers } from "@/lib/supplier-import-store";
import { checkImportRows, IMPORT_FIELDS, MAX_IMPORT_ROWS, type RawImportRow, type RowResult } from "@/lib/supplier-import";

export type ImportPreview = { rows: RowResult[] } | { error: string };
export type ImportOutcome = { rows: RowResult[]; created: { id: string; code: string; name: string }[] } | { error: string };

const rowsSchema = z
  .array(z.object({ rowNumber: z.number().int().positive(), values: z.partialRecord(z.enum(IMPORT_FIELDS), z.string()) }))
  .min(1)
  .max(MAX_IMPORT_ROWS);
const fileNameSchema = z.string().min(1).max(200);

const toResult = ({ rowNumber, name, status, messages }: RowResult): RowResult => ({ rowNumber, name, status, messages });

async function guarded<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message };
    console.error("[supplier import]", err);
    return { error: "The import could not be completed. Nothing was saved. Please try again." };
  }
}

/** Shows what an import would do. Saves nothing. */
export async function previewSupplierImport(rows: RawImportRow[]): Promise<ImportPreview> {
  return guarded(async () => {
    await authorize("manageSuppliers");
    const checked = checkImportRows(rowsSchema.parse(rows), await loadImportLookup(db));
    return { rows: checked.map(toResult) };
  });
}

export async function importSuppliers(rows: RawImportRow[], fileName: string): Promise<ImportOutcome> {
  return guarded(async () => {
    const user = await authorize("manageSuppliers");
    const parsedRows = rowsSchema.parse(rows);
    const parsedName = fileNameSchema.parse(fileName);
    const { checked, created } = await db.transaction((tx) => saveImportedSuppliers(tx, parsedRows, user.id, parsedName));
    revalidatePath("/suppliers");
    return { rows: checked.map(toResult), created };
  });
}
