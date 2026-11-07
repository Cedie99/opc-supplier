/**
 * How the raw metric value of a criterion is obtained.
 * - percent_ratio: (a / b) × 100   e.g. on-time in-full = orders on time ÷ orders due × 100
 * - price_diff:    (a − b) / b × 100   e.g. supplier landed cost vs lowest qualified landed cost
 * - average:       a / b              e.g. total response hours ÷ number of requests
 * - value:         a                  a number typed directly (e.g. credit days)
 * - manual:        no number; the evaluator picks a rating using the guideline descriptions
 */
export type InputMode = "percent_ratio" | "price_diff" | "average" | "value" | "manual";

export type Direction = "higher_better" | "lower_better";

export type Threshold = {
  rating: 1 | 2 | 3 | 4 | 5;
  /** higher_better: value must be ≥ min for this rating. */
  min?: number | null;
  /** lower_better: value must be ≤ max for this rating. */
  max?: number | null;
  /** Short label shown in the table, e.g. "0–2%" or "Excellent". */
  label: string;
  /** Longer guideline text (used for manual criteria). */
  description?: string;
};

export type CriterionConfig = {
  key: string;
  name: string;
  /** Weight in percent. Weights in a template should add up to 100. */
  weight: number;
  guideline: string;
  metricLabel: string;
  inputMode: InputMode;
  direction: Direction;
  unit: string;
  numeratorLabel?: string;
  denominatorLabel?: string;
  thresholds: Threshold[];
  /** Allow N/A (weights of the remaining criteria are scaled back up to 100%). */
  allowNa: boolean;
  /** Where the data comes from, shown to the evaluator. */
  basis?: string;
  /** Who fills this criterion (see lib/scoring/ownership.ts). Defaults by key when missing. */
  filledBy?: "purchasing" | "qa" | "warehouse";
};

export type Classification = "preferred" | "approved" | "conditional" | "not_qualified";

export type Band = {
  /** Minimum total score (inclusive) for this band. */
  min: number;
  classification: Classification;
  label: string;
  action: string;
};

export type CriterionInput = {
  key: string;
  numerator?: number | null;
  denominator?: number | null;
  /** Rating chosen by hand (manual criteria) or an override with a reason. */
  manualRating?: number | null;
  isNa?: boolean;
};

export type CriterionResult = {
  key: string;
  name: string;
  weight: number;
  rawValue: number | null;
  /** Rating calculated from the raw value (null when manual/NA/missing). */
  calculatedRating: number | null;
  /** Rating that counts (override or manual if given, otherwise calculated). */
  rating: number | null;
  isNa: boolean;
  /** Weight after N/A criteria are removed and the rest scaled to 100. */
  effectiveWeight: number;
  points: number;
};

export type ScoreResult = {
  criteria: CriterionResult[];
  /** 0–100, or null when nothing could be scored yet. */
  total: number | null;
  complete: boolean;
  missing: string[];
  classification: Classification | null;
  band: Band | null;
  /** Criteria rated below 3 — each needs a corrective action. */
  belowStandard: string[];
};
