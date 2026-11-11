import type { Role } from "@/lib/constants";
import type { ScoreInput } from "@/lib/db/schema";
import type { CriterionConfig } from "./types";

/**
 * Who fills in a scoring field, in the Selection Matrix and the quarterly evaluation:
 *  - QA: sample/test results (Product Quality) and the critical-spec check
 *  - Purchasing (Buyer, Purchasing Manager): on-time delivery and the commercial and relationship criteria
 * Admin can fill everything. Safe to import on the client and the server.
 */
export type FieldOwner = "purchasing" | "qa" | "warehouse";
export type TemplateKind = "selection" | "quarterly";

export const FIELD_OWNER_LABELS: Record<FieldOwner, string> = { purchasing: "Purchasing Associate", qa: "Purchasing Officer", warehouse: "Warehouse" };

/** Used for templates saved before `filledBy` existed. */
const DEFAULT_OWNERS: Record<TemplateKind, Record<string, FieldOwner>> = {
  selection: { quality: "qa" },
  quarterly: { quality: "qa" },
};

export function criterionOwner(criterion: Pick<CriterionConfig, "key" | "filledBy">, kind: TemplateKind = "selection"): FieldOwner {
  return criterion.filledBy ?? DEFAULT_OWNERS[kind][criterion.key] ?? "purchasing";
}

export function canFill(role: Role | null | undefined, owner: FieldOwner): boolean {
  if (role === "admin") return true;
  if (owner === "qa") return role === "qa_officer";
  if (owner === "warehouse") return role === "warehouse";
  return role === "buyer" || role === "purchasing_manager";
}

/**
 * Takes the user's values only for the criteria they own and keeps the stored values for the rest, so people
 * filling the same scorecard never overwrite each other (and a tampered request cannot change others' fields).
 */
export function mergeOwnedInputs(
  criteria: CriterionConfig[],
  kind: TemplateKind,
  role: Role,
  incoming: ScoreInput[],
  stored: ScoreInput[],
): ScoreInput[] {
  return criteria.flatMap((c) => {
    const source = canFill(role, criterionOwner(c, kind)) ? incoming : stored;
    const input = source.find((i) => i.key === c.key);
    return input ? [input] : [];
  });
}
