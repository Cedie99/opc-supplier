import type { RequestType } from "@/lib/constants";

/** Labels for the answers a supplier gives through a request link (client-safe, used to display replies). */
export const RESPONSE_LABELS: Record<string, string> = {
  respondent: "Answered by",
  unitPrice: "Unit price (₱)",
  leadTimeDays: "Lead time (days)",
  validUntil: "Quotation valid until",
  confirmedDate: "Confirmed delivery date",
  quantity: "Quantity",
  decision: "Decision",
  answer: "Answer",
  remarks: "Remarks",
};

export const DECISION_LABELS: Record<string, string> = { accept: "PO accepted as issued", changes: "Changes requested" };

/** What the reply form asks for, per request type. */
export const RESPONSE_FORM: Record<RequestType, "quotation" | "delivery" | "po" | "general"> = {
  quotation: "quotation",
  delivery_follow_up: "delivery",
  order_follow_up: "po",
  urgent_request: "general",
  complaint: "general",
  other: "general",
};

export function responseEntries(response: Record<string, string | number | null> | null | undefined) {
  if (!response) return [];
  const order = Object.keys(RESPONSE_LABELS);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  return Object.entries(response)
    .filter(([, v]) => v !== null && v !== "")
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([k, v]) => ({ label: RESPONSE_LABELS[k] ?? k, value: k === "decision" ? (DECISION_LABELS[String(v)] ?? String(v)) : String(v) }));
}
