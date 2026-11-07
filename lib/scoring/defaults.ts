import type { Band, CriterionConfig } from "./types";

/**
 * Default scoring templates, taken from the "Supplier Selection Matrix" document (Pillar 2, Priority 1).
 * Administrators can change these in Settings → Scoring templates; every save creates a new version.
 *
 * Decisions taken where the source document was inconsistent (review with management):
 * - New-supplier weights follow the detailed criteria table (Price 20%, Quality 30%),
 *   not the sample matrix (25% / 25%).
 * - New-supplier quality is rated on samples (specs passed ÷ specs tested), using the 99/97/95/90 thresholds.
 */

const PRICE_THRESHOLDS: CriterionConfig["thresholds"] = [
  { rating: 5, max: 2, label: "0–2%", description: "Excellent" },
  { rating: 4, max: 5, label: ">2–5%", description: "Very good" },
  { rating: 3, max: 10, label: ">5–10%", description: "Satisfactory" },
  { rating: 2, max: 15, label: ">10–15%", description: "Needs improvement" },
  { rating: 1, label: ">15%", description: "Poor" },
];

const OTIF_THRESHOLDS: CriterionConfig["thresholds"] = [
  { rating: 5, min: 98, label: "98–100%", description: "Excellent" },
  { rating: 4, min: 95, label: "95% to <98%", description: "Very good" },
  { rating: 3, min: 90, label: "90% to <95%", description: "Satisfactory" },
  { rating: 2, min: 80, label: "80% to <90%", description: "Needs improvement" },
  { rating: 1, label: "Below 80%", description: "Poor" },
];

const RESPONSE_THRESHOLDS: CriterionConfig["thresholds"] = [
  { rating: 5, max: 2, label: "Within 2 hours", description: "Excellent" },
  { rating: 4, max: 4, label: ">2–4 hours", description: "Very good" },
  { rating: 3, max: 8, label: ">4–8 hours", description: "Satisfactory" },
  { rating: 2, max: 24, label: ">8–24 hours", description: "Needs improvement" },
  { rating: 1, label: "More than 24 hours", description: "Poor" },
];

export const SELECTION_CRITERIA: CriterionConfig[] = [
  {
    key: "price",
    name: "Price Competitiveness",
    weight: 20,
    guideline: "Compare quotations from at least 2–3 suppliers offering equivalent specifications, using total landed cost.",
    metricLabel: "% above the lowest qualified total landed cost",
    inputMode: "price_diff",
    direction: "lower_better",
    unit: "%",
    numeratorLabel: "Supplier landed cost",
    denominatorLabel: "Lowest qualified landed cost",
    thresholds: PRICE_THRESHOLDS,
    allowNa: false,
    basis: "Supplier quotations, freight and applicable charges",
  },
  {
    key: "quality",
    filledBy: "qa",
    name: "Product Quality",
    weight: 30,
    guideline:
      "Evaluate product samples for compliance with company specifications, durability, functionality and QA test results before approval. A critical specification failure triggers QA review regardless of the rating.",
    metricLabel: "Sample compliance rate",
    inputMode: "percent_ratio",
    direction: "higher_better",
    unit: "%",
    numeratorLabel: "Specifications passed",
    denominatorLabel: "Specifications tested",
    thresholds: [
      { rating: 5, min: 99, label: "99–100%", description: "Excellent" },
      { rating: 4, min: 97, label: "97% to <99%", description: "Very good" },
      { rating: 3, min: 95, label: "95% to <97%", description: "Satisfactory" },
      { rating: 2, min: 90, label: "90% to <95%", description: "Needs improvement" },
      { rating: 1, label: "Below 90%", description: "Poor" },
    ],
    allowNa: false,
    basis: "QA sample evaluation forms and test reports",
  },
  {
    key: "delivery",
    name: "Delivery Reliability",
    weight: 20,
    guideline:
      "Assess the ability to deliver complete orders on schedule. For a new supplier, use a trial order or verified references. Track average lead time separately.",
    metricLabel: "On-time in-full delivery rate",
    inputMode: "percent_ratio",
    direction: "higher_better",
    unit: "%",
    numeratorLabel: "Orders delivered on time and in full",
    denominatorLabel: "Total orders due",
    thresholds: OTIF_THRESHOLDS,
    allowNa: false,
    basis: "Trial order, customer references or committed schedule",
  },
  {
    key: "payment_terms",
    name: "Payment Terms",
    weight: 10,
    guideline:
      "Evaluate credit terms counted from the agreed invoice or receipt date. Evaluate down payment requirements separately, especially for custom molds and special orders.",
    metricLabel: "Credit days granted",
    inputMode: "value",
    direction: "higher_better",
    unit: "days",
    numeratorLabel: "Credit days",
    thresholds: [
      { rating: 5, min: 60, label: "60 days or more", description: "Excellent" },
      { rating: 4, min: 45, label: "45–59 days", description: "Very good" },
      { rating: 3, min: 30, label: "30–44 days", description: "Satisfactory" },
      { rating: 2, min: 15, label: "15–29 days", description: "Needs improvement" },
      { rating: 1, label: "Below 15 days / COD / advance", description: "Poor" },
    ],
    allowNa: false,
    basis: "Quotation and proposed commercial terms",
  },
  {
    key: "responsiveness",
    name: "Responsiveness",
    weight: 10,
    guideline: "Average business hours taken to give a meaningful first response to inquiries. Measure complaint resolution time separately.",
    metricLabel: "Average response time",
    inputMode: "average",
    direction: "lower_better",
    unit: "hours",
    numeratorLabel: "Total business hours to respond",
    denominatorLabel: "Number of requests",
    thresholds: RESPONSE_THRESHOLDS,
    allowNa: false,
    basis: "Emails and communication log",
  },
  {
    key: "credibility",
    name: "Company Credibility",
    weight: 10,
    guideline:
      "Verify legal registration, years in business, customer references and operating capability. Mandatory documents must be valid regardless of years in business; new companies can qualify on demonstrated capacity.",
    metricLabel: "Documents, experience and references",
    inputMode: "manual",
    direction: "higher_better",
    unit: "",
    thresholds: [
      { rating: 5, label: "Excellent", description: "Complete documents, 10+ years in business, strong verified references" },
      { rating: 4, label: "Very good", description: "Complete documents, 5–9 years in business, positive references" },
      { rating: 3, label: "Satisfactory", description: "Complete documents, 2–4 years in business, acceptable references" },
      { rating: 2, label: "Needs improvement", description: "Incomplete non-mandatory documents or limited verifiable track record" },
      { rating: 1, label: "Poor", description: "Invalid mandatory documents or serious unresolved credibility concerns" },
    ],
    allowNa: false,
    basis: "Accreditation documents and reference checks",
  },
];

export const QUARTERLY_CRITERIA: CriterionConfig[] = [
  {
    key: "quality",
    filledBy: "qa",
    name: "Product Quality",
    weight: 30,
    guideline:
      "Evaluate supplier-submitted samples against approved specifications, functionality, durability, appearance and QA results. All mandatory specifications must pass. Require new samples when materials or specifications change.",
    metricLabel: "Sample compliance rate",
    inputMode: "percent_ratio",
    direction: "higher_better",
    unit: "%",
    numeratorLabel: "Specifications passed",
    denominatorLabel: "Specifications tested",
    thresholds: [
      { rating: 5, min: 100, label: "100%", description: "Excellent" },
      { rating: 4, min: 95, label: "95% to <100%", description: "Very good" },
      { rating: 3, min: 90, label: "90% to <95%", description: "Satisfactory" },
      { rating: 2, min: 80, label: "80% to <90%", description: "Needs improvement" },
      { rating: 1, label: "Below 80%", description: "Poor" },
    ],
    allowNa: false,
    basis: "Sample evaluation forms, product specifications and QA test reports",
  },
  {
    key: "delivery",
    filledBy: "warehouse",
    name: "On-Time Delivery",
    weight: 25,
    guideline: "Evaluate deliveries made within the agreed date and quantity during the quarter.",
    metricLabel: "On-time in-full delivery rate",
    inputMode: "percent_ratio",
    direction: "higher_better",
    unit: "%",
    numeratorLabel: "Orders delivered on time and in full",
    denominatorLabel: "Total orders due",
    thresholds: OTIF_THRESHOLDS,
    allowNa: false,
    basis: "Purchase orders, delivery receipts and agreed schedules (ERP)",
  },
  {
    key: "price",
    name: "Price Competitiveness",
    weight: 15,
    guideline: "Compare pricing, including freight and charges, against qualified alternative suppliers offering equivalent products.",
    metricLabel: "Price difference vs lowest qualified price",
    inputMode: "price_diff",
    direction: "lower_better",
    unit: "%",
    numeratorLabel: "Supplier price",
    denominatorLabel: "Lowest qualified price",
    thresholds: PRICE_THRESHOLDS,
    allowNa: false,
    basis: "Quotations, price comparisons and purchasing records",
  },
  {
    key: "responsiveness",
    name: "Responsiveness",
    weight: 15,
    guideline: "Evaluate how quickly the supplier responds to inquiries, purchase orders, delivery follow-ups and urgent concerns.",
    metricLabel: "Average initial response time (business hours)",
    inputMode: "average",
    direction: "lower_better",
    unit: "hours",
    numeratorLabel: "Total business hours to respond",
    denominatorLabel: "Total requests",
    thresholds: RESPONSE_THRESHOLDS,
    allowNa: false,
    basis: "Communication log, emails and correspondence",
  },
  {
    key: "documentation",
    name: "Documentation Compliance",
    weight: 10,
    guideline: "Assess completeness, accuracy and timely submission of invoices, delivery receipts, COA, SDS and other required documents.",
    metricLabel: "Documentation compliance rate",
    inputMode: "percent_ratio",
    direction: "higher_better",
    unit: "%",
    numeratorLabel: "Compliant documents",
    denominatorLabel: "Total required documents",
    thresholds: [
      { rating: 5, min: 100, label: "100%", description: "Excellent" },
      { rating: 4, min: 95, label: "95% to <100%", description: "Very good" },
      { rating: 3, min: 90, label: "90% to <95%", description: "Satisfactory" },
      { rating: 2, min: 80, label: "80% to <90%", description: "Needs improvement" },
      { rating: 1, label: "Below 80%", description: "Poor" },
    ],
    allowNa: false,
    basis: "Purchasing documentation records and verification logs",
  },
  {
    key: "after_sales",
    name: "After-Sales Support",
    weight: 5,
    guideline:
      "Evaluate how effectively complaints, replacements and shortages are resolved within agreed timelines. If no complaints were due this quarter, mark N/A instead of giving a perfect score.",
    metricLabel: "Complaint resolution rate",
    inputMode: "percent_ratio",
    direction: "higher_better",
    unit: "%",
    numeratorLabel: "Complaints resolved on time",
    denominatorLabel: "Total complaints due",
    thresholds: [
      { rating: 5, min: 100, label: "100%", description: "Excellent" },
      { rating: 4, min: 90, label: "90% to <100%", description: "Very good" },
      { rating: 3, min: 80, label: "80% to <90%", description: "Satisfactory" },
      { rating: 2, min: 70, label: "70% to <80%", description: "Needs improvement" },
      { rating: 1, label: "Below 70%", description: "Poor" },
    ],
    allowNa: true,
    basis: "Complaint log, replacement records and corrective actions",
  },
];

export const SELECTION_BANDS: Band[] = [
  { min: 90, classification: "preferred", label: "Preferred Supplier", action: "Prioritize for regular purchasing" },
  { min: 80, classification: "approved", label: "Approved Supplier", action: "Qualified for regular transactions" },
  { min: 70, classification: "conditional", label: "Conditional Approval", action: "Require corrective action and monitoring" },
  { min: 0, classification: "not_qualified", label: "Not Qualified", action: "Reassess before purchasing" },
];

export const QUARTERLY_BANDS: Band[] = [
  { min: 90, classification: "preferred", label: "Preferred Supplier", action: "Prioritize for regular purchasing" },
  { min: 80, classification: "approved", label: "Approved Supplier", action: "Continue purchasing and quarterly monitoring" },
  { min: 70, classification: "conditional", label: "Conditional Approval", action: "Require corrective action and improvement" },
  { min: 0, classification: "not_qualified", label: "Not Qualified", action: "Review supplier status and consider alternatives" },
];
