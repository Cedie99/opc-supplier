import { describe, expect, it } from "vitest";
import { computeRawValue, rateValue, scoreSupplier, validateTemplate } from "./engine";
import { QUARTERLY_BANDS, QUARTERLY_CRITERIA, SELECTION_BANDS, SELECTION_CRITERIA } from "./defaults";

const byKey = (key: string, list = SELECTION_CRITERIA) => list.find((c) => c.key === key)!;
const manual = (ratings: Record<string, number>) =>
  Object.entries(ratings).map(([key, manualRating]) => ({ key, manualRating }));

describe("computeRawValue", () => {
  it("computes the document's formulas", () => {
    expect(computeRawValue("percent_ratio", 47, 50)).toBe(94);
    expect(computeRawValue("price_diff", 110, 100)).toBe(10);
    expect(computeRawValue("average", 30, 10)).toBe(3);
    expect(computeRawValue("value", 45)).toBe(45);
    expect(computeRawValue("manual", 1, 2)).toBeNull();
  });

  it("returns null for missing or zero denominators", () => {
    expect(computeRawValue("percent_ratio", 5, 0)).toBeNull();
    expect(computeRawValue("average", 5, null)).toBeNull();
  });

  it("never returns a negative price difference", () => {
    expect(computeRawValue("price_diff", 95, 100)).toBe(0);
  });
});

describe("rateValue thresholds", () => {
  it("price: lower is better, upper bounds inclusive", () => {
    const c = byKey("price");
    expect(rateValue(c, 0)).toBe(5);
    expect(rateValue(c, 2)).toBe(5);
    expect(rateValue(c, 2.01)).toBe(4);
    expect(rateValue(c, 10)).toBe(3);
    expect(rateValue(c, 15)).toBe(2);
    expect(rateValue(c, 15.1)).toBe(1);
  });

  it("on-time delivery: higher is better, lower bounds inclusive", () => {
    const c = byKey("delivery", QUARTERLY_CRITERIA);
    expect(rateValue(c, 100)).toBe(5);
    expect(rateValue(c, 98)).toBe(5);
    expect(rateValue(c, 97.99)).toBe(4);
    expect(rateValue(c, 90)).toBe(3);
    expect(rateValue(c, 79.9)).toBe(1);
  });

  it("payment terms in credit days", () => {
    const c = byKey("payment_terms");
    expect(rateValue(c, 60)).toBe(5);
    expect(rateValue(c, 59)).toBe(4);
    expect(rateValue(c, 30)).toBe(3);
    expect(rateValue(c, 14)).toBe(1);
  });

  it("responsiveness in hours", () => {
    const c = byKey("responsiveness");
    expect(rateValue(c, 2)).toBe(5);
    expect(rateValue(c, 24)).toBe(2);
    expect(rateValue(c, 25)).toBe(1);
  });
});

describe("scoreSupplier", () => {
  it("reproduces the selection calculator example (83% → Approved, 25/25 weights)", () => {
    const r = scoreSupplier(
      SELECTION_CRITERIA,
      manual({ price: 4, quality: 5, delivery: 3, payment_terms: 4, responsiveness: 5, credibility: 4 }),
      SELECTION_BANDS,
    );
    expect(r.total).toBe(83);
    expect(r.classification).toBe("approved");
    expect(r.criteria.find((c) => c.key === "price")?.points).toBe(20);
  });

  it("reproduces the quarterly example (89% → Approved)", () => {
    const r = scoreSupplier(
      QUARTERLY_CRITERIA,
      manual({ quality: 5, delivery: 4, price: 4, responsiveness: 5, documentation: 4, after_sales: 4 }),
      QUARTERLY_BANDS,
    );
    expect(r.total).toBe(89);
    expect(r.classification).toBe("approved");
    expect(r.belowStandard).toEqual([]);
  });

  it("rescales weights when a criterion is N/A", () => {
    const inputs = [
      ...manual({ quality: 5, delivery: 4, price: 4, responsiveness: 5, documentation: 4 }),
      { key: "after_sales", isNa: true },
    ];
    const r = scoreSupplier(QUARTERLY_CRITERIA, inputs, QUARTERLY_BANDS);
    // (30 + 20 + 12 + 15 + 8) / 95 × 100
    expect(r.total).toBeCloseTo(89.47, 1);
    expect(r.complete).toBe(true);
  });

  it("ignores N/A on criteria that do not allow it", () => {
    const r = scoreSupplier(QUARTERLY_CRITERIA, [{ key: "quality", isNa: true }], QUARTERLY_BANDS);
    expect(r.missing).toContain("Product Quality");
  });

  it("calculates ratings from raw inputs", () => {
    const r = scoreSupplier(
      QUARTERLY_CRITERIA,
      [
        { key: "quality", numerator: 20, denominator: 20 }, // 100% → 5
        { key: "delivery", numerator: 47, denominator: 50 }, // 94% → 3
        { key: "price", numerator: 104, denominator: 100 }, // 4% → 4
        { key: "responsiveness", numerator: 30, denominator: 10 }, // 3h → 4
        { key: "documentation", numerator: 18, denominator: 20 }, // 90% → 3
        { key: "after_sales", numerator: 1, denominator: 2 }, // 50% → 1
      ],
      QUARTERLY_BANDS,
    );
    expect(r.criteria.map((c) => c.rating)).toEqual([5, 3, 4, 4, 3, 1]);
    // 30 + 15 + 12 + 12 + 6 + 1
    expect(r.total).toBe(76);
    expect(r.classification).toBe("conditional");
    expect(r.belowStandard).toEqual(["After-Sales Support"]);
  });

  it("is incomplete until every applicable criterion is rated", () => {
    const r = scoreSupplier(SELECTION_CRITERIA, manual({ price: 5 }), SELECTION_BANDS);
    expect(r.complete).toBe(false);
    expect(r.classification).toBeNull();
    expect(r.missing).toHaveLength(5);
  });

  it("blocking rules force Not Qualified regardless of score", () => {
    const r = scoreSupplier(
      SELECTION_CRITERIA,
      manual({ price: 5, quality: 5, delivery: 5, payment_terms: 5, responsiveness: 5, credibility: 5 }),
      SELECTION_BANDS,
      { blocked: true },
    );
    expect(r.total).toBe(100);
    expect(r.classification).toBe("not_qualified");
  });

  it("uses the exact band edges from the document", () => {
    const r = scoreSupplier(
      SELECTION_CRITERIA,
      manual({ price: 5, quality: 5, delivery: 4, payment_terms: 4, responsiveness: 4, credibility: 4 }),
      SELECTION_BANDS,
    );
    // 20 + 30 + 16 + 8 + 8 + 8 = 90
    expect(r.total).toBe(90);
    expect(r.classification).toBe("preferred");
  });
});

describe("validateTemplate", () => {
  it("accepts the default templates", () => {
    expect(validateTemplate(SELECTION_CRITERIA, SELECTION_BANDS)).toEqual([]);
    expect(validateTemplate(QUARTERLY_CRITERIA, QUARTERLY_BANDS)).toEqual([]);
  });

  it("rejects weights that do not add up to 100", () => {
    const bad = SELECTION_CRITERIA.map((c) => (c.key === "price" ? { ...c, weight: 30 } : c));
    expect(validateTemplate(bad, SELECTION_BANDS)[0]).toMatch(/105%/);
  });
});

import { scoreCanvass } from "./canvass";

describe("scoreCanvass", () => {
  const rest = manual({ quality: 5, delivery: 4, payment_terms: 4, responsiveness: 5, credibility: 4 });
  const entry = (id: string, landedCost: number, extra: Partial<Parameters<typeof scoreCanvass>[2][number]> = {}) => ({
    id,
    supplierId: id,
    landedCost,
    criticalSpecFailed: false,
    blockingDocuments: [],
    inputs: rest,
    ...extra,
  });

  it("compares price with the lowest qualified landed cost", () => {
    const { results, lowestLandedCost } = scoreCanvass(SELECTION_CRITERIA, SELECTION_BANDS, [entry("a", 100), entry("b", 108)]);
    expect(lowestLandedCost).toBe(100);
    expect(results[0].result.criteria.find((c) => c.key === "price")?.rating).toBe(5);
    expect(results[1].result.criteria.find((c) => c.key === "price")?.rawValue).toBe(8);
    expect(results[1].result.criteria.find((c) => c.key === "price")?.rating).toBe(3);
  });

  it("excludes a supplier with a failed critical spec from the price benchmark and the ranking", () => {
    const { lowestLandedCost, best, results } = scoreCanvass(SELECTION_CRITERIA, SELECTION_BANDS, [
      entry("cheap", 80, { criticalSpecFailed: true }),
      entry("a", 100),
      entry("b", 104),
    ]);
    expect(lowestLandedCost).toBe(100);
    expect(results[0].blocked).toBe(true);
    expect(results[0].result.classification).toBe("not_qualified");
    expect(best?.id).toBe("a");
  });

  it("blocks a supplier whose mandatory documents are not verified", () => {
    const { best } = scoreCanvass(SELECTION_CRITERIA, SELECTION_BANDS, [entry("a", 100, { blockingDocuments: ["Business Permit"] }), entry("b", 110)]);
    expect(best?.id).toBe("b");
  });
});
