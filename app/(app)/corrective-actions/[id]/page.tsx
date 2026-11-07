import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { CorrectiveActionBadge } from "@/components/status-badge";
import { ActionForm } from "@/components/form/action-form";
import { FormDialog } from "@/components/form/form-dialog";
import { SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form/fields";
import { db } from "@/lib/db";
import { auditEvents, correctiveActions, evaluations, profiles, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CA_STATUS_LABELS } from "@/lib/constants";
import { fmtDate, fmtDateTime, quarterLabel, todayIso } from "@/lib/format";
import { closeCorrectiveAction, updateCorrectiveAction } from "../actions";

export default async function CorrectiveActionPage({ params }: PageProps<"/corrective-actions/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const action = await db.query.correctiveActions.findFirst({ where: eq(correctiveActions.id, id) });
  if (!action) notFound();

  const actor = alias(profiles, "actor");
  const closer = alias(profiles, "closer");
  const [supplier, evaluation, staff, [people], history] = await Promise.all([
    db.query.suppliers.findFirst({ where: eq(suppliers.id, action.supplierId) }),
    action.evaluationId ? db.query.evaluations.findFirst({ where: eq(evaluations.id, action.evaluationId) }) : null,
    db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles).where(eq(profiles.isActive, true)).orderBy(asc(profiles.fullName)),
    db.select({ closer: closer.fullName }).from(correctiveActions).leftJoin(closer, eq(closer.id, correctiveActions.closedBy)).where(eq(correctiveActions.id, id)),
    db
      .select({ e: auditEvents, actorName: actor.fullName })
      .from(auditEvents)
      .leftJoin(actor, eq(actor.id, auditEvents.actorId))
      .where(and(eq(auditEvents.entityType, "corrective_action"), eq(auditEvents.entityId, id)))
      .orderBy(desc(auditEvents.createdAt)),
  ]);
  if (!supplier) notFound();

  const closed = action.status === "closed";
  const canEdit = !closed && can(user.role, "manageCorrectiveActions");
  const canClose = !closed && ["admin", "purchasing_manager", "qa_officer"].includes(user.role);
  const overdue = !closed && action.dueDate < todayIso();

  return (
    <>
      <PageHeader
        back={{ href: "/corrective-actions", label: "Corrective actions" }}
        title={action.reference}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/suppliers/${supplier.id}?tab=actions`} className="hover:underline">
              {supplier.name}
            </Link>
            {action.criterion && <>· {action.criterion}</>}
            {evaluation && (
              <>
                ·{" "}
                <Link href={`/evaluations/${evaluation.id}`} className="hover:underline">
                  {quarterLabel(evaluation.year, evaluation.quarter)} evaluation
                </Link>
              </>
            )}
            <CorrectiveActionBadge status={action.status} overdue={overdue} />
          </span>
        }
        actions={
          canClose && (
            <FormDialog
              trigger={<Button>Close as effective</Button>}
              title={`Close ${action.reference}`}
              description="Confirm the action fixed the problem (for example, the next deliveries or samples passed)."
              action={closeCorrectiveAction.bind(null, id)}
              submitLabel="Close"
            >
              <TextAreaField label="Verification / closure note" name="closureNote" rows={3} required />
            </FormDialog>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Issue</CardTitle>
            <CardDescription>{action.issue}</CardDescription>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <ActionForm action={updateCorrectiveAction.bind(null, id)} className="grid gap-4 md:grid-cols-2" successMessage="Saved.">
                <TextAreaField label="Root cause" name="rootCause" rows={3} className="md:col-span-2" defaultValue={action.rootCause ?? ""} hint="Why it happened — not the symptom." />
                <TextAreaField label="Action plan" name="actionPlan" rows={4} className="md:col-span-2" defaultValue={action.actionPlan ?? ""} hint="What the supplier (and we) will do, by when." />
                <SelectField label="Internal owner" name="ownerId" defaultValue={action.ownerId ?? ""} placeholder="Unassigned" options={staff.map((s) => ({ value: s.id, label: s.fullName }))} />
                <TextField label="Supplier contact" name="supplierContact" defaultValue={action.supplierContact ?? ""} />
                <TextField label="Due date" name="dueDate" type="date" required defaultValue={action.dueDate} />
                <SelectField
                  label="Status"
                  name="status"
                  defaultValue={action.status}
                  options={(["open", "in_progress", "for_verification"] as const).map((s) => ({ value: s, label: CA_STATUS_LABELS[s] }))}
                />
                <div className="flex justify-end md:col-span-2">
                  <SubmitButton>Save</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <dl className="grid gap-3 text-sm">
                <Item label="Root cause" value={action.rootCause} />
                <Item label="Action plan" value={action.actionPlan} />
                <Item label="Supplier contact" value={action.supplierContact} />
                <Item label="Due date" value={fmtDate(action.dueDate)} />
                {closed && <Item label={`Closed ${fmtDate(action.closedAt)} by ${people?.closer ?? "—"}`} value={action.closureNote} />}
              </dl>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 text-sm">
              {history.map(({ e, actorName }) => (
                <li key={e.id}>
                  <span className="font-medium">{actorName ?? "System"}</span> <span className="text-muted-foreground">{e.action}</span>
                  {e.note && <span className="text-muted-foreground block">{e.note}</span>}
                  <span className="text-muted-foreground block text-xs">{fmtDateTime(e.createdAt)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Item({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="whitespace-pre-wrap">{value || "—"}</dd>
    </div>
  );
}
