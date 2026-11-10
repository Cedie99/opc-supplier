import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SupplierStatusBadge, WorkflowBadge } from "@/components/status-badge";
import { ScorecardEditor, type Suggestions } from "@/components/scoring/scorecard-editor";
import { DecisionButtons } from "@/components/scoring/decision-panel";
import { db } from "@/lib/db";
import { auditEvents, evaluations, profiles, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getTemplate } from "@/lib/templates";
import { getActivityMetrics } from "@/lib/activity";
import { fmtDateTime, fmtNumber, quarterLabel } from "@/lib/format";
import { decideEvaluation, saveEvaluation, submitEvaluation } from "../actions";

export default async function EvaluationPage({ params }: PageProps<"/evaluations/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const evaluation = await db.query.evaluations.findFirst({ where: eq(evaluations.id, id) });
  if (!evaluation) notFound();

  const evaluator = alias(profiles, "evaluator");
  const approver = alias(profiles, "approver");
  const actor = alias(profiles, "actor");
  const [template, supplier, [people], metrics, history] = await Promise.all([
    getTemplate(evaluation.templateId),
    db.query.suppliers.findFirst({ where: eq(suppliers.id, evaluation.supplierId) }),
    db
      .select({ evaluator: evaluator.fullName, approver: approver.fullName })
      .from(evaluations)
      .leftJoin(evaluator, eq(evaluator.id, evaluations.evaluatorId))
      .leftJoin(approver, eq(approver.id, evaluations.approverId))
      .where(eq(evaluations.id, id)),
    getActivityMetrics(evaluation.supplierId, evaluation.year, evaluation.quarter),
    db
      .select({ e: auditEvents, actorName: actor.fullName })
      .from(auditEvents)
      .leftJoin(actor, eq(actor.id, auditEvents.actorId))
      .where(and(eq(auditEvents.entityType, "evaluation"), eq(auditEvents.entityId, id)))
      .orderBy(desc(auditEvents.createdAt)),
  ]);
  if (!template || !supplier) notFound();

  const period = quarterLabel(evaluation.year, evaluation.quarter);
  const editable = (evaluation.status === "draft" || evaluation.status === "returned") && can(user.role, "editEvaluation");
  const canDecide = evaluation.status === "submitted" && can(user.role, "approve") && (evaluation.evaluatorId !== user.id || user.role === "admin");

  // Offer numbers from the activity logs for the matching criteria.
  const suggestions: Suggestions = {};
  for (const c of template.criteria) {
    if (c.inputMode === "average" && c.unit === "hours" && metrics.responsiveness) {
      const r = metrics.responsiveness;
      suggestions[c.key] = {
        label: [
          `${fmtNumber(r.totalHours / r.requests, 1)} business h average over ${r.requests} request(s)`,
          r.noResponses ? `${r.noResponses} without a timely reply` : null,
          r.manual ? `${r.manual} recorded by hand` : null,
          r.waiting ? `${r.waiting} still waiting (not counted yet)` : null,
          r.lowSample ? "small sample — check before using" : null,
        ]
          .filter(Boolean)
          .join("; "),
        apply: { numerator: r.totalHours, denominator: r.requests, isNa: false },
      };
    }
    if (c.key === "after_sales") {
      const a = metrics.afterSales;
      suggestions[c.key] = a.due
        ? { label: `${a.resolvedOnTime} of ${a.due} complaint(s) resolved on time`, apply: { numerator: a.resolvedOnTime, denominator: a.due, isNa: false } }
        : c.allowNa
          ? { label: "no complaints were due this quarter (mark N/A)", apply: { isNa: true } }
          : null;
    }
  }

  return (
    <>
      <PageHeader
        back={{ href: "/evaluations", label: "Quarterly evaluations" }}
        title={`${supplier.name} — ${period}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/suppliers/${supplier.id}`} className="hover:underline">
              {supplier.code}
            </Link>
            · Current status <SupplierStatusBadge status={supplier.status} />· Template {template.name} v{template.version}
            <WorkflowBadge status={evaluation.status} />
          </span>
        }
      />

      {evaluation.status === "returned" && evaluation.decisionNote && (
        <Alert className="mb-6">
          <AlertTitle>Returned by {people?.approver ?? "approver"}</AlertTitle>
          <AlertDescription>{evaluation.decisionNote}</AlertDescription>
        </Alert>
      )}
      {evaluation.status === "approved" && (
        <Alert className="mb-6">
          <AlertTitle>Approved by {people?.approver ?? "—"}</AlertTitle>
          <AlertDescription>
            {evaluation.decisionNote ?? "The supplier's status and latest score were updated from this evaluation."}
          </AlertDescription>
        </Alert>
      )}

      {canDecide && (
        <Card className="mb-6 border-blue-300 dark:border-blue-500/40">
          <CardHeader>
            <CardTitle>Waiting for your approval</CardTitle>
            <CardDescription>
              Prepared by {people?.evaluator ?? "—"}. Approving sets the supplier&apos;s status to the classification below and opens a supplier concern for every criterion rated below 3.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DecisionButtons action={decideEvaluation.bind(null, id)} entityLabel={`${supplier.name} ${period}`} approveHint="The score is recalculated on the server before approval." />
          </CardContent>
        </Card>
      )}

      <ScorecardEditor
        criteria={template.criteria}
        bands={template.bands}
        inputs={evaluation.inputs}
        comments={evaluation.comments}
        readOnly={!editable}
        role={user.role}
        suggestions={editable ? suggestions : {}}
        save={saveEvaluation.bind(null, id)}
        submit={submitEvaluation.bind(null, id)}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No history yet.</p>
          ) : (
            <ol className="grid gap-2 text-sm">
              {history.map(({ e, actorName }) => (
                <li key={e.id}>
                  <span className="font-medium">{actorName ?? "System"}</span> <span className="text-muted-foreground">{e.action.replaceAll("_", " ")}</span>
                  {e.note && <span className="text-muted-foreground"> — {e.note}</span>}
                  <span className="text-muted-foreground block text-xs">{fmtDateTime(e.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  );
}
