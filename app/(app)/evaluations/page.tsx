import Link from "next/link";
import { and, asc, count, desc, eq, ilike, inArray, ne, type SQL } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterBar, Pagination, pageParam, param } from "@/components/filters";
import { ClassificationBadge, TierBadge, WorkflowBadge } from "@/components/status-badge";
import { ActionForm } from "@/components/form/action-form";
import { SelectField, SubmitButton } from "@/components/form/fields";
import { db } from "@/lib/db";
import { evaluations, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ACCREDITED_STATUSES, EVALUATION_STATUSES, WORKFLOW_STATUS_LABELS, type EvaluationStatus } from "@/lib/constants";
import { currentQuarter, fmtScore, quarterLabel } from "@/lib/format";
import { createEvaluation, generateEvaluations } from "./actions";

export const metadata = { title: "Quarterly evaluations" };
const PAGE_SIZE = 25;

export default async function EvaluationsPage({ searchParams }: PageProps<"/evaluations">) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = currentQuarter();
  const q = param(sp, "q");
  const status = param(sp, "status") as EvaluationStatus | undefined;
  const period = param(sp, "period") ?? `${now.year}-${now.quarter}`;
  const preselect = param(sp, "supplier");
  const page = pageParam(sp);
  const [py, pq] = period === "all" ? [null, null] : period.split("-").map(Number);

  const where: SQL[] = [];
  if (py && pq) where.push(eq(evaluations.year, py), eq(evaluations.quarter, pq));
  if (status && EVALUATION_STATUSES.includes(status)) where.push(eq(evaluations.status, status));
  if (q) where.push(ilike(suppliers.name, `%${q}%`));
  const filter = where.length ? and(...where) : undefined;

  const [rows, [{ total }], supplierOptions] = await Promise.all([
    db
      .select({ e: evaluations, name: suppliers.name, code: suppliers.code, tier: suppliers.tier })
      .from(evaluations)
      .innerJoin(suppliers, eq(suppliers.id, evaluations.supplierId))
      .where(filter)
      .orderBy(desc(evaluations.year), desc(evaluations.quarter), asc(suppliers.name))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(evaluations).innerJoin(suppliers, eq(suppliers.id, evaluations.supplierId)).where(filter),
    db
      .select({ id: suppliers.id, name: suppliers.name, code: suppliers.code })
      .from(suppliers)
      .where(preselect ? ne(suppliers.status, "inactive") : inArray(suppliers.status, ACCREDITED_STATUSES))
      .orderBy(asc(suppliers.name)),
  ]);

  // Last 8 quarters for the period filter.
  const periods: { value: string; label: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const idx = now.year * 4 + (now.quarter - 1) - i;
    const y = Math.floor(idx / 4);
    const qtr = (idx % 4) + 1;
    periods.push({ value: `${y}-${qtr}`, label: quarterLabel(y, qtr) });
  }
  const canEdit = can(user.role, "prepareEvaluation");

  return (
    <>
      <PageHeader title="Quarterly evaluations" description="Score existing suppliers on actual performance each quarter. Approval updates their status." />

      {canEdit && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Start the quarter</CardTitle>
              <CardDescription>Creates draft evaluations for every accredited critical and high-spend supplier. Standard suppliers are included in Q4 (yearly).</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={generateEvaluations} className="flex flex-wrap items-end gap-2">
                <PeriodFields defaultYear={now.year} defaultQuarter={now.quarter} />
                <SubmitButton pendingText="Creating…">Create drafts</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Evaluate one supplier</CardTitle>
              <CardDescription>For a standard-tier supplier with an issue, or one added mid-quarter.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={createEvaluation} className="flex flex-wrap items-end gap-2">
                <SelectField
                  label="Supplier"
                  name="supplierId"
                  className="min-w-56 flex-1"
                  defaultValue={preselect}
                  placeholder="Choose…"
                  options={supplierOptions.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                />
                <PeriodFields defaultYear={now.year} defaultQuarter={now.quarter} />
                <SubmitButton>Open</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      )}

      <FilterBar
        q={q}
        placeholder="Search supplier"
        resetHref="/evaluations"
        selects={[
          { name: "period", value: period, allLabel: "Current quarter", options: [...periods, { value: "all", label: "All quarters" }] },
          { name: "status", value: status, allLabel: "All statuses", options: EVALUATION_STATUSES.map((s) => ({ value: s, label: WORKFLOW_STATUS_LABELS[s] })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title="No evaluations for this filter" description="Use “Start the quarter” to create the drafts." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Quarter</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ e, name, code, tier }) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/evaluations/${e.id}`} className="font-medium hover:underline">
                      {name}
                    </Link>
                    <div className="text-muted-foreground text-xs">{code}</div>
                  </TableCell>
                  <TableCell>{quarterLabel(e.year, e.quarter)}</TableCell>
                  <TableCell>
                    <TierBadge tier={tier} />
                  </TableCell>
                  <TableCell>
                    <WorkflowBadge status={e.status} />
                  </TableCell>
                  <TableCell>
                    <ClassificationBadge value={e.classification} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtScore(e.totalScore)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/evaluations" params={{ q, status, period }} />
    </>
  );
}

function PeriodFields({ defaultYear, defaultQuarter }: { defaultYear: number; defaultQuarter: number }) {
  return (
    <>
      <SelectField
        label="Year"
        name="year"
        defaultValue={String(defaultYear)}
        options={[defaultYear - 1, defaultYear, defaultYear + 1].map((y) => ({ value: String(y), label: String(y) }))}
      />
      <SelectField label="Quarter" name="quarter" defaultValue={String(defaultQuarter)} options={[1, 2, 3, 4].map((q) => ({ value: String(q), label: `Q${q}` }))} />
    </>
  );
}
