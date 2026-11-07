import type { Band, Classification, CriterionConfig, CriterionInput, CriterionResult, ScoreResult } from "./types";

const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Turns the two inputs of a criterion into its raw metric value. */
export function computeRawValue(
  mode: CriterionConfig["inputMode"],
  numerator?: number | null,
  denominator?: number | null,
): number | null {
  switch (mode) {
    case "manual":
      return null;
    case "value":
      return isNum(numerator) ? numerator : null;
    case "percent_ratio":
      if (!isNum(numerator) || !isNum(denominator) || denominator <= 0) return null;
      return round((numerator / denominator) * 100);
    case "average":
      if (!isNum(numerator) || !isNum(denominator) || denominator <= 0) return null;
      return round(numerator / denominator);
    case "price_diff":
      if (!isNum(numerator) || !isNum(denominator) || denominator <= 0) return null;
      // A price below the "lowest" reference is still the best price: never negative.
      return round(Math.max(0, ((numerator - denominator) / denominator) * 100));
  }
}

/** Applies the criterion's threshold table to a raw value. Falls back to 1 (Poor). */
export function rateValue(criterion: Pick<CriterionConfig, "direction" | "thresholds">, value: number | null): number | null {
  if (!isNum(value)) return null;
  const rules = [...criterion.thresholds].filter((t) => t.rating > 1).sort((a, b) => b.rating - a.rating);
  for (const rule of rules) {
    if (criterion.direction === "higher_better") {
      if (isNum(rule.min) && value >= rule.min) return rule.rating;
    } else {
      if (isNum(rule.max) && value <= rule.max) return rule.rating;
    }
  }
  return 1;
}

export function classify(total: number | null, bands: Band[]): Band | null {
  if (!isNum(total)) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => total >= b.min) ?? sorted.at(-1) ?? null;
}

const validRating = (r: unknown): r is number => isNum(r) && r >= 1 && r <= 5;

/**
 * Scores a supplier against a template.
 * Weighted score per criterion = rating ÷ 5 × weight, with N/A criteria removed
 * and the remaining weights scaled back up to 100%.
 */
export function scoreSupplier(
  criteria: CriterionConfig[],
  inputs: CriterionInput[],
  bands: Band[],
  opts: { blocked?: boolean } = {},
): ScoreResult {
  const byKey = new Map(inputs.map((i) => [i.key, i]));

  const prelim = criteria.map((c) => {
    const input = byKey.get(c.key);
    const isNa = Boolean(c.allowNa && input?.isNa);
    const rawValue = isNa ? null : computeRawValue(c.inputMode, input?.numerator, input?.denominator);
    const calculatedRating = c.inputMode === "manual" ? null : rateValue(c, rawValue);
    const manual = validRating(input?.manualRating) ? Math.round(input!.manualRating!) : null;
    const rating = isNa ? null : (manual ?? calculatedRating);
    return { c, isNa, rawValue, calculatedRating, rating };
  });

  const applicableWeight = prelim.filter((p) => !p.isNa).reduce((s, p) => s + p.c.weight, 0);
  const scale = applicableWeight > 0 ? 100 / applicableWeight : 0;

  const results: CriterionResult[] = prelim.map(({ c, isNa, rawValue, calculatedRating, rating }) => {
    const effectiveWeight = isNa ? 0 : c.weight * scale;
    const points = rating ? (rating / 5) * effectiveWeight : 0;
    return {
      key: c.key,
      name: c.name,
      weight: c.weight,
      rawValue,
      calculatedRating,
      rating,
      isNa,
      effectiveWeight: round(effectiveWeight),
      points: round(points),
    };
  });

  const missing = results.filter((r) => !r.isNa && r.rating === null).map((r) => r.name);
  const scored = results.filter((r) => r.rating !== null);
  const total = scored.length > 0 && applicableWeight > 0 ? round(results.reduce((s, r) => s + r.points, 0)) : null;
  const complete = missing.length === 0 && total !== null;

  let band = complete ? classify(total, bands) : null;
  let classification: Classification | null = band?.classification ?? null;
  if (opts.blocked && complete) {
    // Blocking rules (invalid mandatory documents, failed critical specification) override the score.
    band = [...bands].sort((a, b) => a.min - b.min)[0] ?? null;
    classification = "not_qualified";
  }

  return {
    criteria: results,
    total,
    complete,
    missing,
    classification,
    band,
    belowStandard: results.filter((r) => r.rating !== null && r.rating < 3).map((r) => r.name),
  };
}

/** Checks a template before it is saved. Returns a list of problems (empty = valid). */
export function validateTemplate(criteria: CriterionConfig[], bands: Band[]): string[] {
  const problems: string[] = [];
  const total = round(criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0));
  if (criteria.length === 0) problems.push("Add at least one criterion.");
  if (total !== 100) problems.push(`Weights add up to ${total}%. They must add up to 100%.`);
  const keys = new Set<string>();
  for (const c of criteria) {
    if (!c.name.trim()) problems.push("Every criterion needs a name.");
    if (keys.has(c.key)) problems.push(`Duplicate criterion key "${c.key}".`);
    keys.add(c.key);
    if (c.weight <= 0) problems.push(`${c.name}: weight must be more than 0.`);
    if (c.inputMode !== "manual") {
      for (const t of c.thresholds.filter((t) => t.rating > 1)) {
        const bound = c.direction === "higher_better" ? t.min : t.max;
        if (!isNum(bound)) problems.push(`${c.name}: rating ${t.rating} needs a ${c.direction === "higher_better" ? "minimum" : "maximum"} value.`);
      }
    }
  }
  if (bands.length === 0) problems.push("Add at least one classification band.");
  return problems;
}
