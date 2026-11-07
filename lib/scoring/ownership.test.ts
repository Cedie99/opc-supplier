import { describe, expect, it } from "vitest";
import { canFill, criterionOwner, mergeOwnedInputs } from "./ownership";
import { QUARTERLY_CRITERIA, SELECTION_CRITERIA } from "./defaults";

const ownersOf = (criteria: typeof SELECTION_CRITERIA, kind: "selection" | "quarterly") =>
  Object.fromEntries(criteria.map((c) => [c.key, criterionOwner(c, kind)]));

describe("field ownership", () => {
  it("Selection Matrix: Product Quality is QA's, the rest Purchasing's", () => {
    const owners = ownersOf(SELECTION_CRITERIA, "selection");
    expect(owners.quality).toBe("qa");
    for (const key of ["price", "delivery", "payment_terms", "responsiveness", "credibility"]) expect(owners[key]).toBe("purchasing");
  });

  it("Quarterly: quality is QA's, delivery Warehouse's, the rest Purchasing's", () => {
    const owners = ownersOf(QUARTERLY_CRITERIA, "quarterly");
    expect(owners.quality).toBe("qa");
    expect(owners.delivery).toBe("warehouse");
    for (const key of ["price", "responsiveness", "documentation", "after_sales"]) expect(owners[key]).toBe("purchasing");
  });

  it("falls back by key for templates saved before filledBy existed", () => {
    expect(criterionOwner({ key: "quality" })).toBe("qa");
    expect(criterionOwner({ key: "delivery" }, "selection")).toBe("purchasing");
    expect(criterionOwner({ key: "delivery" }, "quarterly")).toBe("warehouse");
    expect(criterionOwner({ key: "price" }, "quarterly")).toBe("purchasing");
  });

  it("lets each role fill only its own fields; admin fills everything", () => {
    expect(canFill("qa_officer", "qa")).toBe(true);
    expect(canFill("qa_officer", "purchasing")).toBe(false);
    expect(canFill("warehouse", "warehouse")).toBe(true);
    expect(canFill("warehouse", "qa")).toBe(false);
    expect(canFill("buyer", "warehouse")).toBe(false);
    expect(canFill("buyer", "purchasing")).toBe(true);
    expect(canFill("purchasing_manager", "purchasing")).toBe(true);
    expect(canFill("viewer", "purchasing")).toBe(false);
    for (const o of ["qa", "warehouse", "purchasing"] as const) expect(canFill("admin", o)).toBe(true);
  });

  it("merge keeps stored values for criteria the user does not own", () => {
    const stored = [
      { key: "quality", numerator: 49, denominator: 50 },
      { key: "delivery", numerator: 19, denominator: 20 },
      { key: "price", numerator: 10, denominator: 10 },
    ];
    const tampered = [
      { key: "quality", numerator: 1, denominator: 50 },
      { key: "delivery", numerator: 1, denominator: 20 },
      { key: "price", numerator: 12, denominator: 10 },
    ];
    const asWarehouse = mergeOwnedInputs(QUARTERLY_CRITERIA, "quarterly", "warehouse", tampered, stored);
    expect(asWarehouse.find((i) => i.key === "delivery")?.numerator).toBe(1);
    expect(asWarehouse.find((i) => i.key === "quality")?.numerator).toBe(49);
    expect(asWarehouse.find((i) => i.key === "price")?.numerator).toBe(10);

    const asBuyer = mergeOwnedInputs(QUARTERLY_CRITERIA, "quarterly", "buyer", tampered, stored);
    expect(asBuyer.find((i) => i.key === "price")?.numerator).toBe(12);
    expect(asBuyer.find((i) => i.key === "quality")?.numerator).toBe(49);
    expect(asBuyer.find((i) => i.key === "delivery")?.numerator).toBe(19);
  });
});
