import { cn } from "@/lib/utils";
import {
  CA_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_TIER_LABELS,
  WORKFLOW_STATUS_LABELS,
  type CorrectiveActionStatus,
  type DocumentStatus,
  type SupplierStatus,
  type SupplierTier,
} from "@/lib/constants";
import type { Classification } from "@/lib/scoring/types";

type Tone = "green" | "teal" | "amber" | "red" | "blue" | "gray" | "violet";

const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  teal: "bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/30",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  red: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30",
  gray: "bg-muted text-muted-foreground ring-border",
};

export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

const SUPPLIER_TONE: Record<SupplierStatus, Tone> = {
  prospect: "gray",
  under_review: "blue",
  preferred: "green",
  approved: "teal",
  conditional: "amber",
  not_qualified: "red",
  inactive: "gray",
};
export function SupplierStatusBadge({ status }: { status: SupplierStatus }) {
  return <Pill tone={SUPPLIER_TONE[status]}>{SUPPLIER_STATUS_LABELS[status]}</Pill>;
}

const CLASS_TONE: Record<Classification, Tone> = { preferred: "green", approved: "teal", conditional: "amber", not_qualified: "red" };
const CLASS_LABEL: Record<Classification, string> = {
  preferred: "Preferred",
  approved: "Approved",
  conditional: "Conditional",
  not_qualified: "Not qualified",
};
export function ClassificationBadge({ value }: { value: Classification | null | undefined }) {
  if (!value) return <Pill tone="gray">Incomplete</Pill>;
  return <Pill tone={CLASS_TONE[value]}>{CLASS_LABEL[value]}</Pill>;
}

const WORKFLOW_TONE: Record<string, Tone> = { draft: "gray", submitted: "blue", approved: "green", returned: "amber", cancelled: "gray" };
export function WorkflowBadge({ status }: { status: keyof typeof WORKFLOW_STATUS_LABELS }) {
  return <Pill tone={WORKFLOW_TONE[status] ?? "gray"}>{WORKFLOW_STATUS_LABELS[status]}</Pill>;
}

const DOC_TONE: Record<DocumentStatus, Tone> = { pending: "blue", verified: "green", rejected: "red" };
export function DocumentStatusBadge({ status, expired }: { status: DocumentStatus; expired?: boolean }) {
  if (expired) return <Pill tone="red">Expired</Pill>;
  return <Pill tone={DOC_TONE[status]}>{DOCUMENT_STATUS_LABELS[status]}</Pill>;
}

const CA_TONE: Record<CorrectiveActionStatus, Tone> = { open: "amber", in_progress: "blue", for_verification: "violet", closed: "green" };
export function CorrectiveActionBadge({ status, overdue }: { status: CorrectiveActionStatus; overdue?: boolean }) {
  if (overdue && status !== "closed") return <Pill tone="red">Overdue</Pill>;
  return <Pill tone={CA_TONE[status]}>{CA_STATUS_LABELS[status]}</Pill>;
}

const TIER_TONE: Record<SupplierTier, Tone> = { critical: "violet", high: "blue", standard: "gray" };
export function TierBadge({ tier }: { tier: SupplierTier }) {
  return <Pill tone={TIER_TONE[tier]}>{SUPPLIER_TIER_LABELS[tier]}</Pill>;
}

export function RatingDot({ rating }: { rating: number | null | undefined }) {
  if (rating == null) return <span className="text-muted-foreground">—</span>;
  const tone: Tone = rating >= 5 ? "green" : rating >= 4 ? "teal" : rating >= 3 ? "blue" : rating >= 2 ? "amber" : "red";
  return <Pill tone={tone} className="tabular-nums">{rating}</Pill>;
}
