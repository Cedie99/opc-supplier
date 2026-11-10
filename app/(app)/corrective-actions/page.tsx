import Link from "next/link";
import { and, asc, count, eq, ilike, lt, ne, or, type SQL } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterBar, Pagination, pageParam, param } from "@/components/filters";
import { CorrectiveActionBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { correctiveActions, profiles, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CA_STATUSES, CA_STATUS_LABELS, type CorrectiveActionStatus } from "@/lib/constants";
import { fmtDate, todayIso } from "@/lib/format";

export const metadata = { title: "Supplier concerns" };
const PAGE_SIZE = 25;

export default async function CorrectiveActionsPage({ searchParams }: PageProps<"/corrective-actions">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status") as CorrectiveActionStatus | "overdue" | "active" | undefined;
  const page = pageParam(sp);
  const today = todayIso();

  const where: SQL[] = [];
  if (q) where.push(or(ilike(suppliers.name, `%${q}%`), ilike(correctiveActions.reference, `%${q}%`), ilike(correctiveActions.issue, `%${q}%`))!);
  if (status === "overdue") where.push(ne(correctiveActions.status, "closed"), lt(correctiveActions.dueDate, today));
  else if (status === "active" || !status) where.push(ne(correctiveActions.status, "closed"));
  else if (CA_STATUSES.includes(status as CorrectiveActionStatus)) where.push(eq(correctiveActions.status, status as CorrectiveActionStatus));
  const filter = and(...where);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ a: correctiveActions, supplierName: suppliers.name, owner: profiles.fullName })
      .from(correctiveActions)
      .innerJoin(suppliers, eq(suppliers.id, correctiveActions.supplierId))
      .leftJoin(profiles, eq(profiles.id, correctiveActions.ownerId))
      .where(filter)
      .orderBy(asc(correctiveActions.dueDate))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(correctiveActions).innerJoin(suppliers, eq(suppliers.id, correctiveActions.supplierId)).where(filter),
  ]);

  return (
    <>
      <PageHeader
        title="Supplier concerns"
        description="Supplier improvement and concern records. Opened automatically for any criterion rated below 3."
        actions={
          can(user.role, "manageCorrectiveActions") && (
            <Button asChild>
              <Link href="/corrective-actions/new">
                <PlusIcon /> New supplier concern
              </Link>
            </Button>
          )
        }
      />
      <FilterBar
        q={q}
        placeholder="Search supplier, reference or issue"
        resetHref="/corrective-actions"
        selects={[
          {
            name: "status",
            value: status,
            allLabel: "Not closed",
            options: [{ value: "overdue", label: "Overdue" }, ...CA_STATUSES.map((s) => ({ value: s, label: CA_STATUS_LABELS[s] }))],
          },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title="No supplier concerns" description="Nothing matches this filter." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ a, supplierName, owner }) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/corrective-actions/${a.id}`} className="font-medium hover:underline">
                      {a.reference}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/suppliers/${a.supplierId}`} className="hover:underline">
                      {supplierName}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-80 truncate text-sm">
                    {a.criterion && <span className="text-muted-foreground">{a.criterion}: </span>}
                    {a.issue}
                  </TableCell>
                  <TableCell className="text-sm">{owner ?? "—"}</TableCell>
                  <TableCell className="text-sm">{fmtDate(a.dueDate)}</TableCell>
                  <TableCell>
                    <CorrectiveActionBadge status={a.status} overdue={a.dueDate < today} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/corrective-actions" params={{ q, status }} />
    </>
  );
}
