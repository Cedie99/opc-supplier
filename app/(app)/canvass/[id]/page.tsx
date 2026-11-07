import { notFound } from "next/navigation";
import { and, asc, desc, eq, notInArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Pill, WorkflowBadge } from "@/components/status-badge";
import { PackageIcon, PlusIcon } from "lucide-react";
import { ActionForm } from "@/components/form/action-form";
import { SelectField, SubmitButton } from "@/components/form/fields";
import { CanvassMatrix } from "@/components/scoring/canvass-matrix";
import { ConfirmActionButton, DecisionButtons } from "@/components/scoring/decision-panel";
import { db } from "@/lib/db";
import { auditEvents, canvassEntries, canvasses, materialCategories, profiles, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCompliance } from "@/lib/accreditation";
import { getTemplate } from "@/lib/templates";
import { fmtDateTime } from "@/lib/format";
import { addCanvassSupplier, cancelCanvass, decideCanvass, removeCanvassSupplier, saveCanvass, submitCanvass } from "../actions";

export default async function CanvassPage({ params }: PageProps<"/canvass/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const canvass = await db.query.canvasses.findFirst({ where: eq(canvasses.id, id) });
  if (!canvass) notFound();

  const creator = alias(profiles, "creator");
  const decider = alias(profiles, "decider");
  const actor = alias(profiles, "actor");
  const [template, entryRows, [meta], history] = await Promise.all([
    getTemplate(canvass.templateId),
    db
      .select({ entry: canvassEntries, name: suppliers.name, code: suppliers.code })
      .from(canvassEntries)
      .innerJoin(suppliers, eq(suppliers.id, canvassEntries.supplierId))
      .where(eq(canvassEntries.canvassId, id))
      .orderBy(asc(canvassEntries.createdAt)),
    db
      .select({ category: materialCategories.name, creator: creator.fullName, decider: decider.fullName })
      .from(canvasses)
      .leftJoin(materialCategories, eq(materialCategories.id, canvasses.categoryId))
      .leftJoin(creator, eq(creator.id, canvasses.createdBy))
      .leftJoin(decider, eq(decider.id, canvasses.decidedBy))
      .where(eq(canvasses.id, id)),
    db
      .select({ e: auditEvents, actorName: actor.fullName })
      .from(auditEvents)
      .leftJoin(actor, eq(actor.id, auditEvents.actorId))
      .where(and(eq(auditEvents.entityType, "canvass"), eq(auditEvents.entityId, id)))
      .orderBy(desc(auditEvents.createdAt)),
  ]);
  if (!template) notFound();

  const compliance = await Promise.all(entryRows.map((r) => getCompliance(r.entry.supplierId)));
  const inCanvass = entryRows.map((r) => r.entry.supplierId);
  const addable = await db
    .select({ id: suppliers.id, name: suppliers.name, code: suppliers.code })
    .from(suppliers)
    .where(inCanvass.length ? and(ne(suppliers.status, "inactive"), notInArray(suppliers.id, inCanvass)) : ne(suppliers.status, "inactive"))
    .orderBy(asc(suppliers.name));

  const open = canvass.status === "draft" || canvass.status === "returned";
  const editable = open && can(user.role, "editCanvass");
  const canPrepare = open && can(user.role, "prepareCanvass");
  const canDecide = canvass.status === "submitted" && can(user.role, "approve") && (canvass.createdBy !== user.id || user.role === "admin");

  const entries = entryRows.map((r, i) => ({
    id: r.entry.id,
    supplierId: r.entry.supplierId,
    supplierName: r.name,
    supplierCode: r.code,
    landedCost: r.entry.landedCost,
    quotationRef: r.entry.quotationRef,
    criticalSpecFailed: r.entry.criticalSpecFailed,
    notes: r.entry.notes,
    inputs: r.entry.inputs,
    blockingDocuments: compliance[i].blocking,
  }));

  return (
    <>
      <PageHeader
        back={{ href: "/canvass", label: "Selection Matrix" }}
        title={canvass.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{canvass.reference}</span>
            <WorkflowBadge status={canvass.status} />
            <Pill tone="gray">{meta?.category ?? "General"}</Pill>
            <Pill tone="gray">
              {template.name} v{template.version}
            </Pill>
            <span className="text-xs">
              {entries.length} supplier{entries.length === 1 ? "" : "s"} · prepared by {meta?.creator ?? "—"}
            </span>
          </span>
        }
        actions={canPrepare && <ConfirmActionButton action={cancelCanvass.bind(null, id)} label="Cancel canvass" confirmLabel="Cancel this canvass?" variant="ghost" />}
      />

      {canvass.materialDescription && (
        <div className="bg-muted/60 mb-6 flex max-w-4xl items-start gap-3 rounded-2xl px-4 py-3 text-sm">
          <PackageIcon className="text-primary mt-0.5 size-4 shrink-0" />
          <p className="whitespace-pre-wrap">{canvass.materialDescription}</p>
        </div>
      )}

      {canvass.status === "returned" && canvass.decisionNote && (
        <Alert className="mb-6 rounded-2xl border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTitle>Returned by {meta?.decider ?? "approver"}</AlertTitle>
          <AlertDescription>{canvass.decisionNote}</AlertDescription>
        </Alert>
      )}

      {canDecide && (
        <Card className="border-primary ring-primary/20 mb-6 ring-2">
          <CardHeader>
            <CardTitle>Waiting for your approval</CardTitle>
            <CardDescription>
              Prepared by {meta?.creator ?? "—"}. Approving accredits the recommended supplier with its classification and opens corrective actions for any criterion rated below 3.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DecisionButtons action={decideCanvass.bind(null, id)} entityLabel={canvass.reference} approveHint="The recommended supplier is re-checked (documents and score) before it is accredited." />
          </CardContent>
        </Card>
      )}

      {canPrepare && (
        <Card className="mb-6 py-4">
          <CardContent className="px-4">
            <ActionForm action={addCanvassSupplier.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <SelectField
                label="Add a supplier to compare"
                name="supplierId"
                className="min-w-72 flex-1"
                placeholder="Choose…"
                options={addable.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
              />
              <SubmitButton variant="secondary">
                <PlusIcon /> Add to canvass
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <CanvassMatrix
        key={entries.map((e) => e.id).join(",")}
        criteria={template.criteria}
        bands={template.bands}
        entries={entries}
        recommendedSupplierId={canvass.recommendedSupplierId}
        recommendation={canvass.recommendation}
        readOnly={!editable}
        role={user.role}
        save={saveCanvass.bind(null, id)}
        submit={submitCanvass.bind(null, id)}
        remove={removeCanvassSupplier.bind(null, id)}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No history yet.</p>
          ) : (
            <ol className="before:bg-border relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px">
              {history.map(({ e, actorName }, i) => (
                <li key={e.id} className="relative grid grid-cols-[15px_1fr] gap-4 text-sm">
                  <span
                    aria-hidden
                    className={`border-card mt-1 size-[15px] rounded-full border-[3px] ring-1 ${i === 0 ? "bg-highlight ring-highlight" : "bg-primary ring-primary/40"}`}
                  />
                  <div>
                    <span className="font-medium">{actorName ?? "System"}</span> <span className="text-muted-foreground">{e.action.replaceAll("_", " ")}</span>
                    {e.note && <span className="text-muted-foreground"> — {e.note}</span>}
                    <span className="text-muted-foreground block text-xs">{fmtDateTime(e.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  );
}
