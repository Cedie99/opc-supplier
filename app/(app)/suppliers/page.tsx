import Link from "next/link";
import { and, asc, count, eq, exists, ilike, or, sql, type SQL } from "drizzle-orm";
import { FileSpreadsheetIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterBar, Pagination, pageParam, param } from "@/components/filters";
import { SupplierStatusBadge, TierBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { materialCategories, supplierCategories, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SUPPLIER_STATUSES, SUPPLIER_STATUS_LABELS, SUPPLIER_TIERS, SUPPLIER_TIER_LABELS, type SupplierStatus, type SupplierTier } from "@/lib/constants";
import { fmtScore } from "@/lib/format";

export const metadata = { title: "Suppliers" };
const PAGE_SIZE = 25;

export default async function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status") as SupplierStatus | undefined;
  const tier = param(sp, "tier") as SupplierTier | undefined;
  const category = param(sp, "category");
  const page = pageParam(sp);

  const where: SQL[] = [];
  if (q) {
    const like = `%${q}%`;
    where.push(or(ilike(suppliers.name, like), ilike(suppliers.code, like), ilike(suppliers.tradeName, like), ilike(suppliers.erpVendorCode, like))!);
  }
  if (status && SUPPLIER_STATUSES.includes(status)) where.push(eq(suppliers.status, status));
  if (tier && SUPPLIER_TIERS.includes(tier)) where.push(eq(suppliers.tier, tier));
  if (category) {
    where.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(supplierCategories)
          .where(and(eq(supplierCategories.supplierId, suppliers.id), eq(supplierCategories.categoryId, category))),
      ),
    );
  }
  const filter = where.length ? and(...where) : undefined;

  const [rows, [{ total }], categories] = await Promise.all([
    db
      .select({
        id: suppliers.id,
        code: suppliers.code,
        name: suppliers.name,
        tier: suppliers.tier,
        status: suppliers.status,
        latestScore: suppliers.latestScore,
        isSingleSource: suppliers.isSingleSource,
        categories: sql<string | null>`(
          select string_agg(mc.name, ', ' order by mc.name)
          from ${supplierCategories} sc join ${materialCategories} mc on mc.id = sc.category_id
          where sc.supplier_id = ${suppliers.id}
        )`,
      })
      .from(suppliers)
      .where(filter)
      .orderBy(asc(suppliers.name))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(suppliers).where(filter),
    db.select({ id: materialCategories.id, name: materialCategories.name }).from(materialCategories).orderBy(asc(materialCategories.name)),
  ]);

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Accredited Supplier Masterlist: every supplier, its status, tier and latest score."
        actions={
          can(user.role, "manageSuppliers") && (
            <>
              <Button variant="outline" asChild>
                <Link href="/suppliers/import">
                  <FileSpreadsheetIcon /> Import from Excel
                </Link>
              </Button>
              <Button asChild>
                <Link href="/suppliers/new">
                  <PlusIcon /> New supplier
                </Link>
              </Button>
            </>
          )
        }
      />
      <FilterBar
        q={q}
        placeholder="Search name, code or ERP vendor code"
        resetHref="/suppliers"
        selects={[
          { name: "status", value: status, allLabel: "All statuses", options: SUPPLIER_STATUSES.map((s) => ({ value: s, label: SUPPLIER_STATUS_LABELS[s] })) },
          { name: "tier", value: tier, allLabel: "All tiers", options: SUPPLIER_TIERS.map((t) => ({ value: t, label: SUPPLIER_TIER_LABELS[t] })) },
          { name: "category", value: category, allLabel: "All categories", options: categories.map((c) => ({ value: c.id, label: c.name })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title="No suppliers found" description={q || status || tier || category ? "Try different filters." : "Register your first supplier to get started."} />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Latest score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/suppliers/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                      {s.code}
                      {s.isSingleSource && (
                        <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400">
                          · <TriangleAlertIcon className="size-3" /> single source
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-64 truncate text-sm">{s.categories ?? "—"}</TableCell>
                  <TableCell>
                    <TierBadge tier={s.tier} />
                  </TableCell>
                  <TableCell>
                    <SupplierStatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtScore(s.latestScore)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/suppliers" params={{ q, status, tier, category }} />
    </>
  );
}
