import { describe, expect, it } from "vitest";
import { checkImportRows, ImportFileError, MAX_IMPORT_ROWS, readImportSheet, type ImportLookup, type RawImportRow } from "./supplier-import";

const lookup: ImportLookup = {
  categories: [
    { id: "bottles", name: "Bottles & Caps" },
    { id: "oils", name: "Base Oils" },
    { id: "comma", name: "Pallets, Crates" },
  ],
  existing: [{ code: "SUP-0001", name: "Acme Trading Corp.", tin: "123-456-789", erpVendorCode: "V100" }],
};
const row = (values: RawImportRow["values"], rowNumber = 2): RawImportRow => ({ rowNumber, values });
const check = (values: RawImportRow["values"]) => checkImportRows([row(values)], lookup)[0];

describe("readImportSheet", () => {
  it("matches headings in any order and spelling, and reports the rest", () => {
    const { rows, ignoredColumns } = readImportSheet([
      ["E-mail Address", "Supplier Name", "Status"],
      ["a@b.ph", "Beta Inc", "Approved"],
    ]);
    expect(rows).toEqual([{ rowNumber: 2, values: { email: "a@b.ph", name: "Beta Inc" } }]);
    expect(ignoredColumns).toEqual(["Status"]);
  });

  it("finds headings below a title, skips blank rows and keeps real row numbers", () => {
    const { rows } = readImportSheet([["Supplier list 2026"], [], ["Company name", "Phone"], [null, null], ["Gamma", 9171234567]]);
    expect(rows).toEqual([{ rowNumber: 5, values: { name: "Gamma", phone: "9171234567" } }]);
  });

  it("refuses a file without the required heading, without rows, or with too many rows", () => {
    expect(() => readImportSheet([["Foo"], ["Bar"]])).toThrow(ImportFileError);
    expect(() => readImportSheet([["Company name"]])).toThrow(/no supplier rows/);
    expect(() => readImportSheet([["Company name"], ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`S${i}`])])).toThrow(/at most/);
  });
});

describe("checkImportRows", () => {
  it("applies the same defaults as the manual form", () => {
    expect(check({ name: "New Co" })).toMatchObject({ status: "ready", details: { name: "New Co", tier: "standard", moldOwnership: "not_applicable", isSingleSource: false }, categoryIds: [] });
  });

  it("understands labels and everyday spellings", () => {
    const result = check({ name: "New Co", tier: "High Spend", moldOwnership: "Owned by supplier", isSingleSource: "YES", creditTermsDays: "30 days", yearEstablished: "2010", categories: "base oils; Bottles & Caps" });
    expect(result).toMatchObject({ status: "ready", details: { tier: "high", moldOwnership: "supplier", isSingleSource: true, creditTermsDays: 30, yearEstablished: 2010 } });
    expect(result.categoryIds).toEqual(["oils", "bottles"]);
  });

  it("accepts commas between categories and inside a category name", () => {
    expect(check({ name: "New Co", categories: "Base Oils, Bottles & Caps" }).categoryIds).toEqual(["oils", "bottles"]);
    expect(check({ name: "New Co", categories: "Pallets, Crates" }).categoryIds).toEqual(["comma"]);
  });

  it("reports every problem on a row", () => {
    const result = check({ email: "nope", tier: "Gold", isSingleSource: "maybe", yearEstablished: "abc", categories: "Chemicals" });
    expect(result.status).toBe("invalid");
    expect(result.messages.join(" ")).toMatch(/Tier "Gold"/);
    expect(result.messages.join(" ")).toMatch(/Single source/);
    expect(result.messages.join(" ")).toMatch(/Unknown category: Chemicals/);
    expect(result.messages.join(" ")).toMatch(/Company name is required/);
    expect(result.messages.join(" ")).toMatch(/valid email/);
    expect(result.messages.join(" ")).toMatch(/Year established must be a whole number/);
  });

  it("explains a value that is too long", () => {
    expect(check({ name: "x".repeat(201) }).messages).toEqual(["Company name is too long (at most 200 characters)."]);
  });

  it("never lets a file set a supplier's status", () => {
    expect(check({ name: "New Co" }).details).not.toHaveProperty("status");
  });

  it("leaves out matches on name, TIN or ERP code, ignoring punctuation and case", () => {
    expect(check({ name: "ACME trading corp" })).toMatchObject({ status: "duplicate", messages: ["Same company name as Acme Trading Corp. (SUP-0001)."] });
    expect(check({ name: "Other", tin: "123456789" }).status).toBe("duplicate");
    expect(check({ name: "Other", erpVendorCode: "v100" }).status).toBe("duplicate");
  });

  it("keeps the first of two matching rows in a file", () => {
    const [first, second] = checkImportRows([row({ name: "Twin Co" }, 2), row({ name: "Twin Co." }, 3)], lookup);
    expect(first.status).toBe("ready");
    expect(second).toMatchObject({ status: "duplicate", messages: ["Same company name as row 2 of this file."] });
  });

  it("does not let a rejected row block a later correct one", () => {
    const [first, second] = checkImportRows([row({ name: "Fix Co", email: "bad" }, 2), row({ name: "Fix Co" }, 3)], lookup);
    expect(first.status).toBe("invalid");
    expect(second.status).toBe("ready");
  });
});
