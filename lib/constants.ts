// Shared constants and labels. Safe to import from client and server code.
// Statuses are stored as text columns (not Postgres enums) so new values never need an enum migration.

export const ROLES = ["admin", "purchasing_manager", "buyer", "qa_officer", "warehouse", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  purchasing_manager: "Purchasing Manager",
  buyer: "Buyer (Purchasing)",
  qa_officer: "QA Officer",
  warehouse: "Warehouse",
  viewer: "Management (view only)",
};

export const SUPPLIER_STATUSES = [
  "prospect",
  "under_review",
  "preferred",
  "approved",
  "conditional",
  "not_qualified",
  "inactive",
] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  prospect: "Prospect",
  under_review: "Under review",
  preferred: "Preferred",
  approved: "Approved",
  conditional: "Conditional",
  not_qualified: "Not qualified",
  inactive: "Inactive",
};

/** Statuses that allow regular purchasing. */
export const ACCREDITED_STATUSES: SupplierStatus[] = ["preferred", "approved", "conditional"];

export const SUPPLIER_TIERS = ["critical", "high", "standard"] as const;
export type SupplierTier = (typeof SUPPLIER_TIERS)[number];
export const SUPPLIER_TIER_LABELS: Record<SupplierTier, string> = {
  critical: "Critical",
  high: "High spend",
  standard: "Standard",
};
/** How often each tier is evaluated. */
export const TIER_FREQUENCY: Record<SupplierTier, string> = {
  critical: "Quarterly",
  high: "Quarterly",
  standard: "Yearly or on issue",
};

export const MOLD_OWNERSHIP = ["not_applicable", "company", "supplier", "shared"] as const;
export type MoldOwnership = (typeof MOLD_OWNERSHIP)[number];
export const MOLD_OWNERSHIP_LABELS: Record<MoldOwnership, string> = {
  not_applicable: "Not applicable",
  company: "Owned by us",
  supplier: "Owned by supplier",
  shared: "Shared ownership",
};

export const DOCUMENT_STATUSES = ["pending", "verified", "rejected"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
};

export const TEMPLATE_KINDS = ["selection", "quarterly"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  selection: "Supplier Selection Matrix (new suppliers)",
  quarterly: "Quarterly Performance Evaluation (existing suppliers)",
};

export const CANVASS_STATUSES = ["draft", "submitted", "approved", "returned", "cancelled"] as const;
export type CanvassStatus = (typeof CANVASS_STATUSES)[number];

export const EVALUATION_STATUSES = ["draft", "submitted", "approved", "returned"] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const WORKFLOW_STATUS_LABELS: Record<CanvassStatus | EvaluationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted for approval",
  approved: "Approved",
  returned: "Returned",
  cancelled: "Cancelled",
};

export const CA_STATUSES = ["open", "in_progress", "for_verification", "closed"] as const;
export type CorrectiveActionStatus = (typeof CA_STATUSES)[number];
export const CA_STATUS_LABELS: Record<CorrectiveActionStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  for_verification: "For verification",
  closed: "Closed",
};

export const COMPLAINT_STATUSES = ["open", "resolved"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const REQUEST_TYPES = ["quotation", "order_follow_up", "delivery_follow_up", "urgent_request", "complaint", "other"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  quotation: "Quotation request",
  order_follow_up: "PO confirmation",
  delivery_follow_up: "Delivery date confirmation",
  urgent_request: "Urgent request",
  complaint: "Complaint follow-up",
  other: "General inquiry",
};

/** open → responded, or no_response after the deadline (a late reply still turns it into responded). closed = withdrawn, not counted. */
export const REQUEST_STATUSES = ["open", "responded", "no_response", "closed"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * Working time used for response times (Philippine time, UTC+8, no daylight saving).
 * Holidays are managed in Settings → Categories & documents.
 */
export const BUSINESS_HOURS = {
  utcOffsetHours: 8,
  /** 0 = Sunday … 6 = Saturday */
  workDays: [1, 2, 3, 4, 5] as number[],
  startHour: 8,
  endHour: 17,
};
/** Business hours in one working day. */
export const BUSINESS_DAY_HOURS = BUSINESS_HOURS.endHour - BUSINESS_HOURS.startHour;
/** Send one reminder after 1 business day without a reply. */
export const REQUEST_REMINDER_AFTER_HOURS = BUSINESS_DAY_HOURS;
/** After 3 business days without a reply the request counts as "no response" (scored at this many hours). */
export const REQUEST_NO_RESPONSE_AFTER_HOURS = 3 * BUSINESS_DAY_HOURS;
/** Request links stay usable this long, so a late reply can still be recorded. */
export const REQUEST_LINK_DAYS = 14;
/** Fewer requests than this in a quarter is a small sample; the evaluator is warned. */
export const RESPONSIVENESS_MIN_REQUESTS = 3;

/** Days before expiry when a document is flagged as expiring. */
export const DOCUMENT_EXPIRY_WARNING_DAYS = 30;
