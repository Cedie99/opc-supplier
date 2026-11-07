import type { Role } from "@/lib/constants";

/** What each role may do. Every server action checks one of these before touching data. */
export const PERMISSIONS = {
  manageSuppliers: ["admin", "purchasing_manager", "buyer"],
  uploadDocuments: ["admin", "purchasing_manager", "buyer", "qa_officer"],
  /** Only QA judges whether a document is valid. */
  verifyDocuments: ["admin", "qa_officer"],
  /** Fill in Selection Matrix ratings (each role only its own fields — see lib/scoring/ownership.ts). */
  editCanvass: ["admin", "purchasing_manager", "buyer", "qa_officer"],
  /** Create a canvass, choose its suppliers, recommend one and submit it. */
  prepareCanvass: ["admin", "purchasing_manager", "buyer"],
  /** Fill in quarterly evaluation ratings (each role only its own fields — see lib/scoring/ownership.ts). */
  editEvaluation: ["admin", "purchasing_manager", "buyer", "qa_officer", "warehouse"],
  /** Create evaluation drafts and submit them for approval. */
  prepareEvaluation: ["admin", "purchasing_manager", "buyer"],
  approve: ["admin", "purchasing_manager"],
  manageCorrectiveActions: ["admin", "purchasing_manager", "buyer", "qa_officer"],
  logActivity: ["admin", "purchasing_manager", "buyer", "qa_officer", "warehouse"],
  inviteSuppliers: ["admin", "purchasing_manager", "buyer"],
  manageSettings: ["admin"],
  manageUsers: ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return Boolean(role && (PERMISSIONS[permission] as readonly Role[]).includes(role));
}
