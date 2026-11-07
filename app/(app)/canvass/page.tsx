import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterBar, Pagination, pageParam, param } from "@/components/filters";
import { WorkflowBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { canvassEntries, canvasses, materialCategories, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CANVASS_STATUSES, WORKFLOW_STATUS_LABELS, type CanvassStatus } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Selection Matrix" };
const PAGE_SIZE = 25;

export default async function CanvassListPage({ searchParams }: PageProps<"/canvass">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status") as CanvassStatus | undefined;
  const page = pageParam(sp);

  const where: SQL[] = [];
  if (q) where.push(or(ilike(canvasses.title, `%${q}%`), ilike(canvasses.reference, `%${q}%`))!);
  if (status && CANVASS_STATUSES.includes(status)) where.push(eq(canvasses.status, status));
  const filter = where.length ? and(...where) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        c: canvasses,
        category: materialCategories.name,
        selected: suppliers.name,
        entryCount: sql<number>`(select count(*)::int from ${canvassEntries} ce where ce.canvass_id = ${canvasses.id})`,
      })
      .from(canvasses)
      .leftJoin(materialCategories, eq(materialCategories.id, canvasses.categoryId))
      .leftJoin(suppliers, eq(suppliers.id, canvasses.recommendedSupplierId))
      .where(filter)
      .orderBy(desc(canvasses.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(canvasses).where(filter),
  ]);

  return (
    <>
      <PageHeader
        title="Supplier Selection Matrix"
        description="Canvass and compare 2–3 suppliers for a material. The approved choice becomes an accredited supplier."
        actions={
          can(user.role, "prepareCanvass") && (
            <Button asChild>
              <Link href="/canvass/new">
                <PlusIcon /> New canvass
              </Link>
            </Button>
          )
        }
      />
      <FilterBar
        q={q}
        placeholder="Search title or reference"
        resetHref="/canvass"
        selects={[{ name: "status", value: status, allLabel: "All statuses", options: CANVASS_STATUSES.map((s) => ({ value: s, label: WORKFLOW_STATUS_LABELS[s] })) }]}
      />
      {rows.length === 0 ? (
        <EmptyState title="No canvasses yet" description="Start a canvass when sourcing a new or alternative supplier." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canvass</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Suppliers</TableHead>
                <TableHead>Recommended</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ c, category, selected, entryCount }) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/canvass/${c.id}`} className="font-medium hover:underline">
                      {c.title}
                    </Link>
                    <div className="text-muted-foreground text-xs">{c.reference}</div>
                  </TableCell>
                  <TableCell className="text-sm">{category ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{entryCount}</TableCell>
                  <TableCell className="text-sm">{selected ?? "—"}</TableCell>
                  <TableCell>
                    <WorkflowBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/canvass" params={{ q, status }} />
    </>
  );
}
