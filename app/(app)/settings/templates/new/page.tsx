import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { TemplateEditor } from "@/components/settings/template-editor";
import { db } from "@/lib/db";
import { materialCategories, scoringTemplates } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getActiveTemplate } from "@/lib/templates";
import { TEMPLATE_KINDS, type TemplateKind } from "@/lib/constants";
import { saveTemplateVersion } from "../../actions";

export const metadata = { title: "New category template" };

/** Starts a category-specific template as a copy of the general one. */
export default async function NewTemplatePage({ searchParams }: PageProps<"/settings/templates/new">) {
  await requireUser("manageSettings");
  const { kind, category } = await searchParams;
  if (typeof kind !== "string" || !TEMPLATE_KINDS.includes(kind as TemplateKind) || typeof category !== "string") notFound();
  const cat = await db.query.materialCategories.findFirst({ where: eq(materialCategories.id, category) });
  if (!cat) notFound();

  const existing = await db.query.scoringTemplates.findFirst({
    where: and(eq(scoringTemplates.kind, kind as TemplateKind), eq(scoringTemplates.categoryId, category), eq(scoringTemplates.isActive, true)),
  });
  if (existing) redirect(`/settings/templates/${existing.id}`);

  const base = await getActiveTemplate(kind as TemplateKind, null);
  if (!base) notFound();

  return (
    <>
      <PageHeader back={{ href: "/settings/templates", label: "Scoring templates" }} title={`New template for ${cat.name}`} description="Starts as a copy of the general template." />
      <TemplateEditor
        kind={kind as TemplateKind}
        categoryId={cat.id}
        categoryName={cat.name}
        initialName={`${base.name} — ${cat.name}`}
        initialCriteria={base.criteria}
        initialBands={base.bands}
        save={saveTemplateVersion}
      />
    </>
  );
}
