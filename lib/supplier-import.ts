import { z } from "zod";
import { MOLD_OWNERSHIP_LABELS, SUPPLIER_TIER_LABELS, type MoldOwnership, type SupplierTier } from "@/lib/constants";
import { supplierSchema, type SupplierDetails } from "@/lib/supplier-schema";

/** Reading and checking an Excel list of suppliers. Used by the browser (reading) and the server (checking). */

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
/** Server actions accept 1 MB; rows are sent as JSON. */
export const MAX_IMPORT_PAYLOAD_CHARS = 900_000;

export const IMPORT_COLUMNS = [
  { field: "name", label: "Company name", aliases: ["registered company name", "supplier name", "supplier", "company", "name"] },
  { field: "tradeName", label: "Trade name", aliases: ["dba", "doing business as"] },
  { field: "tin", label: "TIN", aliases: ["tin number", "tin no", "tax id"] },
  { field: "yearEstablished", label: "Year established", aliases: ["established", "year founded"] },
  { field: "address", label: "Address", aliases: ["company address", "business address"] },
  { field: "website", label: "Website", aliases: ["web site", "url"] },
  { field: "erpVendorCode", label: "ERP vendor code", aliases: ["vendor code", "erp code"] },
  { field: "contactPerson", label: "Contact person", aliases: ["contact name", "contact"] },
  { field: "email", label: "Email", aliases: ["email address", "e mail", "e mail address"] },
  { field: "phone", label: "Phone", aliases: ["phone number", "telephone", "tel", "mobile", "contact number"] },
  { field: "tier", label: "Tier", aliases: ["supplier tier"] },
  { field: "creditTermsDays", label: "Credit terms (days)", aliases: ["credit terms days", "credit terms", "terms"] },
  { field: "moldOwnership", label: "Mold ownership", aliases: ["mould ownership"] },
  { field: "isSingleSource", label: "Single source", aliases: [] },
  { field: "categories", label: "Categories", aliases: ["category", "material categories", "material category"] },
  { field: "notes", label: "Notes", aliases: ["remarks", "internal notes"] },
] as const;

export type ImportField = (typeof IMPORT_COLUMNS)[number]["field"];
export const IMPORT_FIELDS = IMPORT_COLUMNS.map((c) => c.field) as [ImportField, ...ImportField[]];

export type RawImportRow = { rowNumber: number; values: Partial<Record<ImportField, string>> };
export type ImportSheet = { rows: RawImportRow[]; ignoredColumns: string[] };
export type ImportLookup = {
  categories: { id: string; name: string }[];
  existing: { code: string; name: string; tin: string | null; erpVendorCode: string | null }[];
};
export type CheckedRow = {
  rowNumber: number;
  name: string;
  status: "ready" | "duplicate" | "invalid";
  messages: string[];
  details?: SupplierDetails;
  categoryIds?: string[];
};
/** What the screen needs to know about a row. */
export type RowResult = Pick<CheckedRow, "rowNumber" | "name" | "status" | "messages">;

export class ImportFileError extends Error {}

/** "E-mail Address " and "e mail address" compare equal. */
const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const compact = (text: string) => normalize(text).replaceAll(" ", "");

const HEADER_TO_FIELD = new Map<string, ImportField>(
  IMPORT_COLUMNS.flatMap((c) => [c.label, c.field, ...c.aliases].map((header) => [normalize(header), c.field] as [string, ImportField])),
);
const LABEL = new Map<string, string>(IMPORT_COLUMNS.map((c) => [c.field, c.label]));

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "boolean") return cell ? "yes" : "no";
  return String(cell).trim();
}

/** Turns the cells of a worksheet into supplier rows. The heading row may sit below a title. */
export function readImportSheet(sheet: unknown[][]): ImportSheet {
  const headerIndex = sheet.slice(0, 10).findIndex((row) => row.some((cell) => HEADER_TO_FIELD.get(normalize(cellText(cell))) === "name"));
  if (headerIndex === -1) {
    throw new ImportFileError('No "Company name" column was found on the first sheet. Use the template, or add that heading to your file.');
  }

  const columns = new Map<number, ImportField>();
  const ignoredColumns: string[] = [];
  sheet[headerIndex].forEach((cell, index) => {
    const heading = cellText(cell);
    if (!heading) return;
    const field = HEADER_TO_FIELD.get(normalize(heading));
    if (field && ![...columns.values()].includes(field)) columns.set(index, field);
    else ignoredColumns.push(heading);
  });

  const rows: RawImportRow[] = [];
  sheet.slice(headerIndex + 1).forEach((cells, offset) => {
    const values: RawImportRow["values"] = {};
    for (const [index, field] of columns) {
      const text = cellText(cells[index]);
      if (text) values[field] = text;
    }
    if (Object.keys(values).length) rows.push({ rowNumber: headerIndex + offset + 2, values });
  });

  if (!rows.length) throw new ImportFileError("The file has no supplier rows under its headings.");
  if (rows.length > MAX_IMPORT_ROWS) throw new ImportFileError(`The file has ${rows.length} suppliers. Import at most ${MAX_IMPORT_ROWS} at a time by splitting it into smaller files.`);
  return { rows, ignoredColumns };
}

const TIERS = new Map<string, SupplierTier>([
  ...Object.entries(SUPPLIER_TIER_LABELS).flatMap(([code, label]) => [normalize(code), normalize(label)].map((key) => [key, code as SupplierTier] as [string, SupplierTier])),
]);
const MOLDS = new Map<string, MoldOwnership>([
  ...Object.entries(MOLD_OWNERSHIP_LABELS).flatMap(([code, label]) => [normalize(code), normalize(label)].map((key) => [key, code as MoldOwnership] as [string, MoldOwnership])),
  ["n a", "not_applicable"],
  ["na", "not_applicable"],
  ["none", "not_applicable"],
]);
const YES_NO = new Map<string, boolean>([
  ["yes", true],
  ["y", true],
  ["true", true],
  ["no", false],
  ["n", false],
  ["false", false],
]);

function issueMessage(issue: z.core.$ZodIssue): string {
  const label = LABEL.get(String(issue.path[0])) ?? String(issue.path[0]);
  if (issue.code === "too_big" && issue.origin === "string") return `${label} is too long (at most ${issue.maximum} characters).`;
  if (issue.message.startsWith(label)) return issue.message;
  if (issue.code === "invalid_type") return `${label} must be a whole number.`;
  return issue.message.startsWith("Too") ? `${label} is out of range.` : issue.message;
}

function matchCategories(cell: string, categories: ImportLookup["categories"]) {
  const byName = new Map(categories.map((c) => [normalize(c.name), c.id]));
  const ids = new Set<string>();
  const unknown: string[] = [];
  for (const part of cell.split(/[;\n]/).map((p) => p.trim()).filter(Boolean)) {
    const whole = byName.get(normalize(part));
    if (whole) {
      ids.add(whole);
      continue;
    }
    for (const piece of part.split(",").map((p) => p.trim()).filter(Boolean)) {
      const id = byName.get(normalize(piece));
      if (id) ids.add(id);
      else unknown.push(piece);
    }
  }
  return { ids: [...ids], unknown };
}

function checkRow({ rowNumber, values }: RawImportRow, lookup: ImportLookup): CheckedRow {
  const messages: string[] = [];
  const name = values.name ?? "";

  const tier = values.tier ? TIERS.get(normalize(values.tier)) : "standard";
  if (!tier) messages.push(`Tier "${values.tier}" is not recognised. Use Critical, High spend or Standard.`);
  const moldOwnership = values.moldOwnership ? MOLDS.get(normalize(values.moldOwnership)) : "not_applicable";
  if (!moldOwnership) messages.push(`Mold ownership "${values.moldOwnership}" is not recognised. Use Not applicable, Owned by us, Owned by supplier or Shared ownership.`);
  const isSingleSource = values.isSingleSource ? YES_NO.get(normalize(values.isSingleSource)) : false;
  if (isSingleSource === undefined) messages.push(`Single source must be Yes or No, not "${values.isSingleSource}".`);

  const categories = matchCategories(values.categories ?? "", lookup.categories);
  if (categories.unknown.length) messages.push(`Unknown ${categories.unknown.length > 1 ? "categories" : "category"}: ${categories.unknown.join(", ")}.`);

  const parsed = supplierSchema.safeParse({
    name: values.name,
    tradeName: values.tradeName,
    contactPerson: values.contactPerson,
    email: values.email,
    phone: values.phone,
    address: values.address,
    tin: values.tin,
    website: values.website,
    yearEstablished: values.yearEstablished,
    creditTermsDays: values.creditTermsDays?.replace(/\s*days?$/i, ""),
    tier: tier ?? "standard",
    isSingleSource: isSingleSource ?? false,
    moldOwnership: moldOwnership ?? "not_applicable",
    erpVendorCode: values.erpVendorCode,
    notes: values.notes,
  });
  if (!parsed.success) messages.push(...parsed.error.issues.map(issueMessage));

  if (messages.length || !parsed.success) return { rowNumber, name, status: "invalid", messages };
  return { rowNumber, name, status: "ready", messages, details: parsed.data, categoryIds: categories.ids };
}

/**
 * Checks every row against the rules for a new supplier and against suppliers already registered.
 * Existing suppliers are never changed, so a match by company name, TIN or ERP vendor code is left out.
 */
export function checkImportRows(rows: RawImportRow[], lookup: ImportLookup): CheckedRow[] {
  const taken = {
    name: new Map(lookup.existing.map((s) => [compact(s.name), `${s.name} (${s.code})`])),
    tin: new Map(lookup.existing.filter((s) => s.tin).map((s) => [compact(s.tin!), `${s.name} (${s.code})`])),
    erp: new Map(lookup.existing.filter((s) => s.erpVendorCode).map((s) => [compact(s.erpVendorCode!), `${s.name} (${s.code})`])),
  };

  return rows.map((row) => {
    const checked = checkRow(row, lookup);
    if (checked.status !== "ready") return checked;

    const keys = { name: compact(row.values.name ?? ""), tin: compact(row.values.tin ?? ""), erp: compact(row.values.erpVendorCode ?? "") };
    const clashes = [
      keys.name && taken.name.get(keys.name) && `Same company name as ${taken.name.get(keys.name)}.`,
      keys.tin && taken.tin.get(keys.tin) && `Same TIN as ${taken.tin.get(keys.tin)}.`,
      keys.erp && taken.erp.get(keys.erp) && `Same ERP vendor code as ${taken.erp.get(keys.erp)}.`,
    ].filter((message): message is string => Boolean(message));
    if (clashes.length) return { rowNumber: row.rowNumber, name: checked.name, status: "duplicate", messages: clashes };

    const source = `row ${row.rowNumber} of this file`;
    taken.name.set(keys.name, source);
    if (keys.tin) taken.tin.set(keys.tin, source);
    if (keys.erp) taken.erp.set(keys.erp, source);
    return checked;
  });
}
