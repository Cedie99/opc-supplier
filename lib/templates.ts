import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { scoringTemplates } from "@/lib/db/schema";
import type { TemplateKind } from "@/lib/constants";

/** The active template for a kind: the category's own template if it has one, otherwise the general one. */
export async function getActiveTemplate(kind: TemplateKind, categoryId?: string | null) {
  if (categoryId) {
    const specific = await db.query.scoringTemplates.findFirst({
      where: and(eq(scoringTemplates.kind, kind), eq(scoringTemplates.isActive, true), eq(scoringTemplates.categoryId, categoryId)),
      orderBy: desc(scoringTemplates.version),
    });
    if (specific) return specific;
  }
  return db.query.scoringTemplates.findFirst({
    where: and(eq(scoringTemplates.kind, kind), eq(scoringTemplates.isActive, true), isNull(scoringTemplates.categoryId)),
    orderBy: desc(scoringTemplates.version),
  });
}

export async function getTemplate(id: string) {
  return db.query.scoringTemplates.findFirst({ where: eq(scoringTemplates.id, id) });
}
