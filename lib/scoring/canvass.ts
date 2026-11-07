import { scoreSupplier } from "./engine";
import type { Band, CriterionConfig, CriterionInput, ScoreResult } from "./types";

export type CanvassEntryInput = {
  id: string;
  supplierId: string;
  landedCost: number | null;
  criticalSpecFailed: boolean;
  /** Mandatory documents not verified (blocks selection). */
  blockingDocuments: string[];
  inputs: CriterionInput[];
};

export type CanvassEntryResult = CanvassEntryInput & {
  blocked: boolean;
  blockReasons: string[];
  result: ScoreResult;
};

/**
 * Scores every supplier in a canvass side by side.
 * The price criterion compares each landed cost with the LOWEST landed cost among technically qualified
 * suppliers (no critical specification failure), as the Selection Matrix requires.
 */
export function scoreCanvass(criteria: CriterionConfig[], bands: Band[], entries: CanvassEntryInput[]) {
  const priceKeys = criteria.filter((c) => c.inputMode === "price_diff").map((c) => c.key);
  const qualifiedCosts = entries
    .filter((e) => !e.criticalSpecFailed && e.landedCost != null && e.landedCost > 0)
    .map((e) => e.landedCost as number);
  const lowest = qualifiedCosts.length ? Math.min(...qualifiedCosts) : null;

  const results: CanvassEntryResult[] = entries.map((e) => {
    const inputs = e.inputs.filter((i) => !priceKeys.includes(i.key));
    for (const key of priceKeys) {
      const own = e.inputs.find((i) => i.key === key);
      inputs.push({ key, numerator: e.landedCost, denominator: lowest, manualRating: own?.manualRating ?? null });
    }
    const blockReasons = [
      ...(e.criticalSpecFailed ? ["Failed a critical specification"] : []),
      ...(e.blockingDocuments.length ? [`Mandatory documents not verified: ${e.blockingDocuments.join(", ")}`] : []),
    ];
    const blocked = blockReasons.length > 0;
    return { ...e, blocked, blockReasons, result: scoreSupplier(criteria, inputs, bands, { blocked }) };
  });

  const ranked = results
    .filter((r) => !r.blocked && r.result.complete && r.result.total != null)
    .sort((a, b) => (b.result.total ?? 0) - (a.result.total ?? 0));

  return { lowestLandedCost: lowest, results, best: ranked[0] ?? null };
}
