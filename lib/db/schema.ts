import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  CA_STATUSES,
  CANVASS_STATUSES,
  COMPLAINT_STATUSES,
  DOCUMENT_STATUSES,
  EVALUATION_STATUSES,
  MOLD_OWNERSHIP,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  ROLES,
  SUPPLIER_STATUSES,
  SUPPLIER_TIERS,
  TEMPLATE_KINDS,
} from "@/lib/constants";
import type { Band, Classification, CriterionConfig } from "@/lib/scoring/types";

// Column helpers
const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const score = () => numeric({ precision: 5, scale: 2, mode: "number" });

// ─── People ──────────────────────────────────────────────────────────────────

/** One row per Supabase Auth user (id = auth.users.id). */
export const profiles = pgTable("profiles", {
  id: uuid().primaryKey(),
  email: text().notNull().unique(),
  fullName: text().notNull(),
  role: text({ enum: ROLES }).notNull().default("viewer"),
  department: text(),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── Reference data ──────────────────────────────────────────────────────────

export const materialCategories = pgTable("material_categories", {
  id: id(),
  name: text().notNull().unique(),
  description: text(),
  /** Critical materials need at least one approved alternative supplier. */
  isCritical: boolean().notNull().default(false),
  createdAt: createdAt(),
});

export const documentTypes = pgTable("document_types", {
  id: id(),
  name: text().notNull().unique(),
  description: text(),
  /** Missing or rejected mandatory documents block accreditation. */
  isMandatory: boolean().notNull().default(false),
  hasExpiry: boolean().notNull().default(false),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
});

// ─── Suppliers ───────────────────────────────────────────────────────────────

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    code: text().notNull().unique(),
    name: text().notNull(),
    tradeName: text(),
    contactPerson: text(),
    email: text(),
    phone: text(),
    address: text(),
    tin: text(),
    website: text(),
    yearEstablished: integer(),
    creditTermsDays: integer(),
    tier: text({ enum: SUPPLIER_TIERS }).notNull().default("standard"),
    status: text({ enum: SUPPLIER_STATUSES }).notNull().default("prospect"),
    /** Dedicated molds or no alternative source. */
    isSingleSource: boolean().notNull().default(false),
    moldOwnership: text({ enum: MOLD_OWNERSHIP }).notNull().default("not_applicable"),
    erpVendorCode: text(),
    latestScore: score(),
    latestScoreAt: timestamp({ withTimezone: true }),
    accreditedAt: timestamp({ withTimezone: true }),
    notes: text(),
    createdBy: uuid().references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.status), index().on(t.tier), index("suppliers_name_idx").on(t.name)],
);

export const supplierCategories = pgTable(
  "supplier_categories",
  {
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    categoryId: uuid()
      .notNull()
      .references(() => materialCategories.id, { onDelete: "cascade" }),
    /** Specific materials, e.g. "1L HDPE bottle, 38mm cap". */
    materials: text(),
  },
  (t) => [primaryKey({ columns: [t.supplierId, t.categoryId] }), index().on(t.categoryId)],
);

export const supplierDocuments = pgTable(
  "supplier_documents",
  {
    id: id(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    documentTypeId: uuid()
      .notNull()
      .references(() => documentTypes.id),
    storagePath: text().notNull(),
    fileName: text().notNull(),
    fileSize: integer(),
    mimeType: text(),
    issuedOn: date(),
    expiresOn: date(),
    status: text({ enum: DOCUMENT_STATUSES }).notNull().default("pending"),
    reviewNote: text(),
    /** Null when uploaded by the supplier through the registration link. */
    uploadedBy: uuid().references(() => profiles.id),
    reviewedBy: uuid().references(() => profiles.id),
    reviewedAt: timestamp({ withTimezone: true }),
    /** Older versions are kept for history; only the latest per type counts. */
    isCurrent: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.supplierId), index().on(t.expiresOn), index().on(t.status)],
);

/**
 * Links sent to suppliers. "registration": the full company form plus all documents (like CRS customer form links).
 * "resubmission": upload only the listed document types (e.g. ones QA rejected), nothing else.
 */
export const supplierInvites = pgTable("supplier_invites", {
  id: id(),
  token: text().notNull().unique(),
  purpose: text().$type<"registration" | "resubmission">().notNull().default("registration"),
  /** For a resubmission link: the document types the supplier is asked to upload again. */
  documentTypeIds: jsonb().$type<string[]>(),
  supplierId: uuid().references(() => suppliers.id, { onDelete: "cascade" }),
  email: text(),
  companyName: text(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  submittedAt: timestamp({ withTimezone: true }),
  createdBy: uuid()
    .notNull()
    .references(() => profiles.id),
  createdAt: createdAt(),
});

// ─── Scoring templates (versioned) ───────────────────────────────────────────

export const scoringTemplates = pgTable(
  "scoring_templates",
  {
    id: id(),
    kind: text({ enum: TEMPLATE_KINDS }).notNull(),
    /** Null = applies to every category without its own template. */
    categoryId: uuid().references(() => materialCategories.id),
    name: text().notNull(),
    version: integer().notNull(),
    isActive: boolean().notNull().default(true),
    criteria: jsonb().$type<CriterionConfig[]>().notNull(),
    bands: jsonb().$type<Band[]>().notNull(),
    changeNote: text(),
    createdBy: uuid().references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.kind, t.isActive)],
);

// ─── Canvass / Supplier Selection Matrix ─────────────────────────────────────

export const canvasses = pgTable(
  "canvasses",
  {
    id: id(),
    reference: text().notNull().unique(),
    title: text().notNull(),
    categoryId: uuid().references(() => materialCategories.id),
    materialDescription: text(),
    templateId: uuid()
      .notNull()
      .references(() => scoringTemplates.id),
    status: text({ enum: CANVASS_STATUSES }).notNull().default("draft"),
    recommendedSupplierId: uuid().references(() => suppliers.id),
    recommendation: text(),
    decisionNote: text(),
    createdBy: uuid()
      .notNull()
      .references(() => profiles.id),
    decidedBy: uuid().references(() => profiles.id),
    submittedAt: timestamp({ withTimezone: true }),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.status)],
);

export type ScoreInput = {
  key: string;
  numerator?: number | null;
  denominator?: number | null;
  manualRating?: number | null;
  isNa?: boolean;
  /** Required when manualRating overrides a calculated rating. */
  overrideReason?: string | null;
  note?: string | null;
};

export const canvassEntries = pgTable(
  "canvass_entries",
  {
    id: id(),
    canvassId: uuid()
      .notNull()
      .references(() => canvasses.id, { onDelete: "cascade" }),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id),
    /** Total landed cost (price + freight + charges) per unit, used for the price comparison. */
    landedCost: numeric({ precision: 14, scale: 4, mode: "number" }),
    quotationRef: text(),
    /** A failed critical specification blocks selection regardless of the score. */
    criticalSpecFailed: boolean().notNull().default(false),
    inputs: jsonb().$type<ScoreInput[]>().notNull().default([]),
    totalScore: score(),
    classification: text().$type<Classification>(),
    notes: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex().on(t.canvassId, t.supplierId)],
);

// ─── Quarterly evaluations ───────────────────────────────────────────────────

export const evaluations = pgTable(
  "evaluations",
  {
    id: id(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    templateId: uuid()
      .notNull()
      .references(() => scoringTemplates.id),
    year: smallint().notNull(),
    quarter: smallint().notNull(),
    status: text({ enum: EVALUATION_STATUSES }).notNull().default("draft"),
    inputs: jsonb().$type<ScoreInput[]>().notNull().default([]),
    totalScore: score(),
    classification: text().$type<Classification>(),
    comments: text(),
    decisionNote: text(),
    evaluatorId: uuid().references(() => profiles.id),
    approverId: uuid().references(() => profiles.id),
    submittedAt: timestamp({ withTimezone: true }),
    approvedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex().on(t.supplierId, t.year, t.quarter), index().on(t.year, t.quarter), index().on(t.status)],
);

// ─── Corrective actions ──────────────────────────────────────────────────────

export const correctiveActions = pgTable(
  "corrective_actions",
  {
    id: id(),
    reference: text().notNull().unique(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    evaluationId: uuid().references(() => evaluations.id, { onDelete: "set null" }),
    criterion: text(),
    issue: text().notNull(),
    rootCause: text(),
    actionPlan: text(),
    ownerId: uuid().references(() => profiles.id),
    supplierContact: text(),
    dueDate: date().notNull(),
    status: text({ enum: CA_STATUSES }).notNull().default("open"),
    closureNote: text(),
    closedAt: timestamp({ withTimezone: true }),
    closedBy: uuid().references(() => profiles.id),
    createdBy: uuid().references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.supplierId), index().on(t.status), index().on(t.dueDate)],
);

// ─── Activity logs feeding the quarterly evaluation ──────────────────────────

export const communicationLogs = pgTable(
  "communication_logs",
  {
    id: id(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    requestType: text({ enum: REQUEST_TYPES }).notNull(),
    subject: text().notNull(),
    requestedAt: timestamp({ withTimezone: true }).notNull(),
    respondedAt: timestamp({ withTimezone: true }),
    loggedBy: uuid().references(() => profiles.id),
    /** "link": sent from the system, the supplier answers through a link (times recorded automatically). "manual": logged by hand. */
    channel: text().$type<"link" | "manual">().notNull().default("manual"),
    status: text({ enum: REQUEST_STATUSES }).notNull().default("open"),
    /** Link requests: the secret token in the supplier's link. */
    token: text().unique(),
    message: text(),
    recipientEmail: text(),
    /** "link": answered through the link; "other": staff recorded a reply received by phone, chat, etc. */
    respondedVia: text().$type<"link" | "other">(),
    response: jsonb().$type<Record<string, string | number | null>>(),
    responseFile: jsonb().$type<{ path: string; fileName: string; fileSize: number; mimeType: string }>(),
    reminderSentAt: timestamp({ withTimezone: true }),
    noResponseAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.supplierId, t.requestedAt), index().on(t.status)],
);

/** Every email the system sends. Without SMTP settings they are kept here (status "not_configured") instead of sent. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    toEmail: text().notNull(),
    replyTo: text(),
    subject: text().notNull(),
    html: text().notNull(),
    text: text().notNull(),
    status: text().$type<"pending" | "sent" | "failed" | "not_configured">().notNull().default("pending"),
    error: text(),
    attempts: integer().notNull().default(0),
    relatedType: text(),
    relatedId: uuid(),
    supplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    createdBy: uuid().references(() => profiles.id),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt), index().on(t.status)],
);

/** In-app notifications (the bell). */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text().notNull(),
    body: text(),
    href: text(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.readAt)],
);

/** Non-working days, excluded from business-hour response times. */
export const holidays = pgTable("holidays", {
  id: id(),
  date: date().notNull().unique(),
  name: text().notNull(),
  createdAt: createdAt(),
});

export const complaints = pgTable(
  "complaints",
  {
    id: id(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    description: text().notNull(),
    raisedOn: date().notNull(),
    dueOn: date().notNull(),
    resolvedOn: date(),
    status: text({ enum: COMPLAINT_STATUSES }).notNull().default("open"),
    resolution: text(),
    loggedBy: uuid().references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.supplierId, t.dueOn)],
);

// ─── Audit trail ─────────────────────────────────────────────────────────────

/** One generic event table for every entity (a lesson from CRS's per-type event tables). */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    entityType: text().notNull(),
    entityId: uuid().notNull(),
    /** Supplier the event belongs to, for the supplier history tab. */
    supplierId: uuid(),
    action: text().notNull(),
    actorId: uuid().references(() => profiles.id),
    actorLabel: text(),
    note: text(),
    data: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.entityType, t.entityId), index().on(t.supplierId), index().on(t.createdAt)],
);

/** Simple counters for human-readable references (SUP-0001, CNV-2026-001, CAR-2026-001). */
export const counters = pgTable("counters", {
  key: text().primaryKey(),
  value: integer().notNull().default(0),
});

// ─── Relations ───────────────────────────────────────────────────────────────

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  categories: many(supplierCategories),
  documents: many(supplierDocuments),
  evaluations: many(evaluations),
  correctiveActions: many(correctiveActions),
}));

export const supplierCategoriesRelations = relations(supplierCategories, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierCategories.supplierId], references: [suppliers.id] }),
  category: one(materialCategories, { fields: [supplierCategories.categoryId], references: [materialCategories.id] }),
}));

export const supplierDocumentsRelations = relations(supplierDocuments, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierDocuments.supplierId], references: [suppliers.id] }),
  documentType: one(documentTypes, { fields: [supplierDocuments.documentTypeId], references: [documentTypes.id] }),
}));

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  supplier: one(suppliers, { fields: [evaluations.supplierId], references: [suppliers.id] }),
  template: one(scoringTemplates, { fields: [evaluations.templateId], references: [scoringTemplates.id] }),
}));

export const canvassesRelations = relations(canvasses, ({ one, many }) => ({
  entries: many(canvassEntries),
  template: one(scoringTemplates, { fields: [canvasses.templateId], references: [scoringTemplates.id] }),
  category: one(materialCategories, { fields: [canvasses.categoryId], references: [materialCategories.id] }),
}));

export const canvassEntriesRelations = relations(canvassEntries, ({ one }) => ({
  canvass: one(canvasses, { fields: [canvassEntries.canvassId], references: [canvasses.id] }),
  supplier: one(suppliers, { fields: [canvassEntries.supplierId], references: [suppliers.id] }),
}));

export const correctiveActionsRelations = relations(correctiveActions, ({ one }) => ({
  supplier: one(suppliers, { fields: [correctiveActions.supplierId], references: [suppliers.id] }),
  evaluation: one(evaluations, { fields: [correctiveActions.evaluationId], references: [evaluations.id] }),
}));

export const TABLES_WITH_RLS = [
  "profiles",
  "material_categories",
  "document_types",
  "suppliers",
  "supplier_categories",
  "supplier_documents",
  "supplier_invites",
  "scoring_templates",
  "canvasses",
  "canvass_entries",
  "evaluations",
  "corrective_actions",
  "communication_logs",
  "complaints",
  "audit_events",
  "counters",
] as const;

