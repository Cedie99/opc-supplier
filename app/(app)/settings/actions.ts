"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documentTypes, holidays, materialCategories, profiles, scoringTemplates } from "@/lib/db/schema";
import { authorize, ActionError } from "@/lib/auth";
import { formToObject, runAction, zBool, zRequired, zText, type ActionState } from "@/lib/actions";
import { recordEvent } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateTemplate } from "@/lib/scoring/engine";
import { ROLES, ROLE_LABELS, TEMPLATE_KINDS } from "@/lib/constants";

// ─── Scoring templates ───────────────────────────────────────────────────────

const threshold = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  min: z.number().finite().nullable().optional(),
  max: z.number().finite().nullable().optional(),
  label: z.string().max(100),
  description: z.string().max(300).optional(),
});
const criterion = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/, "Keys use lowercase letters, digits and _"),
  name: z.string().min(1).max(100),
  weight: z.number().positive().max(100),
  guideline: z.string().max(2000),
  metricLabel: z.string().max(200),
  inputMode: z.enum(["percent_ratio", "price_diff", "average", "value", "manual"]),
  direction: z.enum(["higher_better", "lower_better"]),
  unit: z.string().max(20),
  numeratorLabel: z.string().max(100).optional(),
  denominatorLabel: z.string().max(100).optional(),
  thresholds: z.array(threshold).length(5),
  allowNa: z.boolean(),
  basis: z.string().max(300).optional(),
  filledBy: z.enum(["purchasing", "qa", "warehouse"]).optional(),
});
const band = z.object({
  min: z.number().min(0).max(100),
  classification: z.enum(["preferred", "approved", "conditional", "not_qualified"]),
  label: z.string().min(1).max(100),
  action: z.string().max(300),
});
const templateSchema = z.object({
  kind: z.enum(TEMPLATE_KINDS),
  categoryId: z.uuid().nullable(),
  name: z.string().min(1).max(150),
  criteria: z.array(criterion).min(1).max(20),
  bands: z.array(band).min(1).max(6),
  changeNote: z.string().min(3, "Describe what changed.").max(1000),
});

/**
 * Saves a template as a NEW version and makes it the active one for its kind and category.
 * Old versions stay, so existing evaluations keep the exact rules they were scored with.
 */
export async function saveTemplateVersion(json: string): Promise<ActionState> {
  let id = "";
  const result = await runAction(async () => {
    const user = await authorize("manageSettings");
    const data = templateSchema.parse(JSON.parse(json));
    const problems = validateTemplate(data.criteria, data.bands);
    if (problems.length) throw new ActionError(problems.join(" "));
    if (!data.bands.some((b) => b.min === 0)) throw new ActionError("One classification band must start at 0%.");

    id = await db.transaction(async (tx) => {
      const scope = and(eq(scoringTemplates.kind, data.kind), data.categoryId ? eq(scoringTemplates.categoryId, data.categoryId) : isNull(scoringTemplates.categoryId));
      const latest = await tx.query.scoringTemplates.findFirst({ where: scope, orderBy: desc(scoringTemplates.version) });
      await tx.update(scoringTemplates).set({ isActive: false }).where(scope);
      const [row] = await tx
        .insert(scoringTemplates)
        .values({ ...data, version: (latest?.version ?? 0) + 1, isActive: true, createdBy: user.id })
        .returning({ id: scoringTemplates.id, version: scoringTemplates.version });
      await recordEvent(tx, { entityType: "template", entityId: row.id, action: "version_created", actorId: user.id, note: `${data.name} v${row.version}: ${data.changeNote}` });
      return row.id;
    });
  });
  if (result.error) return result;
  revalidatePath("/settings/templates");
  redirect(`/settings/templates/${id}`);
}

export async function deactivateTemplate(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("manageSettings");
    const t = await db.query.scoringTemplates.findFirst({ where: eq(scoringTemplates.id, id) });
    if (!t) throw new ActionError("Template not found.");
    if (!t.categoryId) throw new ActionError("The general template cannot be switched off; save a new version instead.");
    await db.update(scoringTemplates).set({ isActive: false }).where(eq(scoringTemplates.id, id));
    await recordEvent(db, { entityType: "template", entityId: id, action: "deactivated", actorId: user.id, note: `${t.name} v${t.version}` });
    revalidatePath("/settings/templates");
    return { ok: true, message: "Template switched off. The category now uses the general template." };
  });
}

// ─── Categories & document types ─────────────────────────────────────────────

// ─── Holidays (skipped in business-hour response times) ──────────────────────

const holidaySchema = z.object({ date: z.iso.date("Enter the date."), name: zRequired("Name", 100) });

export async function saveHoliday(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await authorize("manageSettings");
    const data = holidaySchema.parse(formToObject(formData));
    await db.insert(holidays).values(data).onConflictDoUpdate({ target: holidays.date, set: { name: data.name } });
    revalidatePath("/settings/reference");
    return { ok: true, message: "Holiday saved." };
  });
}

export async function deleteHoliday(id: string): Promise<ActionState> {
  return runAction(async () => {
    await authorize("manageSettings");
    await db.delete(holidays).where(eq(holidays.id, id));
    revalidatePath("/settings/reference");
    return { ok: true, message: "Holiday removed." };
  });
}

const categorySchema = z.object({ name: zRequired("Name", 100), description: zText(500), isCritical: zBool });

export async function saveCategory(id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await authorize("manageSettings");
    const data = categorySchema.parse(formToObject(formData));
    const clash = await db.query.materialCategories.findFirst({
      where: id ? and(eq(materialCategories.name, data.name), ne(materialCategories.id, id)) : eq(materialCategories.name, data.name),
    });
    if (clash) return { error: "Please check the highlighted fields.", fieldErrors: { name: ["A category with this name exists."] } };
    if (id) await db.update(materialCategories).set(data).where(eq(materialCategories.id, id));
    else await db.insert(materialCategories).values(data);
    revalidatePath("/settings/reference");
    return { ok: true, message: "Category saved." };
  });
}

const docTypeSchema = z.object({
  name: zRequired("Name", 150),
  description: zText(500),
  isMandatory: zBool,
  hasExpiry: zBool,
  isActive: zBool,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export async function saveDocumentType(id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await authorize("manageSettings");
    const data = docTypeSchema.parse(formToObject(formData));
    const clash = await db.query.documentTypes.findFirst({
      where: id ? and(eq(documentTypes.name, data.name), ne(documentTypes.id, id)) : eq(documentTypes.name, data.name),
    });
    if (clash) return { error: "Please check the highlighted fields.", fieldErrors: { name: ["A document type with this name exists."] } };
    if (id) await db.update(documentTypes).set(data).where(eq(documentTypes.id, id));
    else await db.insert(documentTypes).values(data);
    revalidatePath("/settings/reference");
    return { ok: true, message: "Document type saved." };
  });
}

// ─── Users ───────────────────────────────────────────────────────────────────

const newUserSchema = z.object({
  fullName: zRequired("Full name", 150),
  email: z.email("Enter a valid email."),
  role: z.enum(ROLES),
  department: zText(100),
  password: z.string({ error: "Set a temporary password." }).min(10, "Use at least 10 characters."),
});

/** Creates a Supabase Auth account (email confirmed) and its staff profile. */
export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await authorize("manageUsers");
    const data = newUserSchema.parse(formToObject(formData));
    const email = data.email.toLowerCase();
    const exists = await db.query.profiles.findFirst({ where: eq(profiles.email, email) });
    if (exists) return { error: "Please check the highlighted fields.", fieldErrors: { email: ["A user with this email exists."] } };

    const supabase = createAdminClient();
    const { data: created, error } = await supabase.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) throw new ActionError(error?.message ?? "Could not create the account.");
    try {
      await db.insert(profiles).values({ id: created.user.id, email, fullName: data.fullName, role: data.role, department: data.department });
    } catch (e) {
      await supabase.auth.admin.deleteUser(created.user.id); // keep auth and profiles in step
      throw e;
    }
    await recordEvent(db, { entityType: "user", entityId: created.user.id, action: "created", actorId: admin.id, note: `${data.fullName} — ${ROLE_LABELS[data.role]}` });
    revalidatePath("/settings/users");
    return { ok: true, message: `${data.fullName} can now sign in. Share the temporary password privately.` };
  });
}

const updateUserSchema = z.object({ role: z.enum(ROLES), department: zText(100), isActive: zBool });

export async function updateUser(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await authorize("manageUsers");
    const data = updateUserSchema.parse(formToObject(formData));
    if (id === admin.id && (data.role !== "admin" || !data.isActive)) throw new ActionError("You cannot remove your own administrator access.");
    // A deactivated user is locked out on their next request: getCurrentUser() rejects inactive profiles.
    await db.update(profiles).set(data).where(eq(profiles.id, id));
    await recordEvent(db, { entityType: "user", entityId: id, action: "updated", actorId: admin.id, note: `${ROLE_LABELS[data.role]}${data.isActive ? "" : " (deactivated)"}` });
    revalidatePath("/settings/users");
    return { ok: true, message: "User updated." };
  });
}
