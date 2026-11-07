import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { TemplateEditor } from "@/components/settings/template-editor";
import { ConfirmActionButton } from "@/components/scoring/decision-panel";
import { db } from "@/lib/db";
import { materialCategories, scoringTemplates } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { deactivateTemplate, saveTemplateVersion } from "../../actions";

export default async function TemplatePage({ params }: PageProps<"/settings/templates/[id]">) {
  await requireUser("manageSettings");
  const { id } = await params;
  const t = await db.query.scoringTemplates.findFirst({ where: eq(scoringTemplates.id, id) });
  if (!t) notFound();
  const category = t.categoryId ? await db.query.materialCategories.findFirst({ where: eq(materialCategories.id, t.categoryId) }) : null;

  return (
    <>
      <PageHeader
        back={{ href: "/settings/templates", label: "Scoring templates" }}
        title={`${t.name} · v${t.version}`}
        description={t.isActive ? "Active version. Editing saves a new version." : "Older version, kept for the evaluations scored with it. Saving makes a new active version based on it."}
        actions={t.isActive && t.categoryId && <ConfirmActionButton action={deactivateTemplate.bind(null, id)} label="Switch off" confirmLabel="Switch off this category template?" />}
      />
      <TemplateEditor
        kind={t.kind}
        categoryId={t.categoryId}
        categoryName={category?.name ?? null}
        initialName={t.name}
        initialCriteria={t.criteria}
        initialBands={t.bands}
        save={saveTemplateVersion}
      />
    </>
  );
}
