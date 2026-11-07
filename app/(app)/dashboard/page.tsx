import Link from "next/link";
import { and, asc, count, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { addDays, format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { BuildingIcon, ClipboardCheckIcon, FileTextIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginIllustration } from "@/components/login-illustration";
import { Pill, SupplierStatusBadge } from "@/components/status-badge";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { canvasses, correctiveActions, evaluations, materialCategories, supplierCategories, supplierDocuments, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { ACCREDITED_STATUSES, DOCUMENT_EXPIRY_WARNING_DAYS, SUPPLIER_STATUSES, SUPPLIER_STATUS_LABELS } from "@/lib/constants";
import { currentQuarter, fmtScore, quarterLabel, todayIso } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const { error } = await searchParams;
  const today = todayIso();
  const warnDate = format(addDays(new Date(), DOCUMENT_EXPIRY_WARNING_DAYS), "yyyy-MM-dd");
  const { year, quarter } = currentQuarter();

  const [byStatus, evalStats, caStats, [expiring], lowest, pendingEvals, pendingCanvasses, categoryCoverage] = await Promise.all([
    db.select({ status: suppliers.status, n: count() }).from(suppliers).groupBy(suppliers.status),
    db
      .select({ status: evaluations.status, n: count() })
      .from(evaluations)
      .where(and(eq(evaluations.year, year), eq(evaluations.quarter, quarter)))
      .groupBy(evaluations.status),
    db
      .select({
        open: sql<number>`count(*) filter (where ${correctiveActions.status} <> 'closed')::int`,
        overdue: sql<number>`count(*) filter (where ${correctiveActions.status} <> 'closed' and ${correctiveActions.dueDate} < ${today})::int`,
      })
      .from(correctiveActions),
    db
      .select({ n: count() })
      .from(supplierDocuments)
      .where(and(eq(supplierDocuments.isCurrent, true), isNotNull(supplierDocuments.expiresOn), lte(supplierDocuments.expiresOn, warnDate))),
    db
      .select({ id: suppliers.id, name: suppliers.name, status: suppliers.status, score: suppliers.latestScore })
      .from(suppliers)
      .where(and(inArray(suppliers.status, ACCREDITED_STATUSES), isNotNull(suppliers.latestScore)))
      .orderBy(asc(suppliers.latestScore))
      .limit(5),
    db
      .select({ id: evaluations.id, name: suppliers.name, year: evaluations.year, quarter: evaluations.quarter, score: evaluations.totalScore })
      .from(evaluations)
      .innerJoin(suppliers, eq(suppliers.id, evaluations.supplierId))
      .where(eq(evaluations.status, "submitted"))
      .orderBy(asc(evaluations.submittedAt))
      .limit(10),
    db
      .select({ id: canvasses.id, title: canvasses.title, reference: canvasses.reference })
      .from(canvasses)
      .where(eq(canvasses.status, "submitted"))
      .orderBy(asc(canvasses.submittedAt))
      .limit(10),
    // Accredited suppliers per critical category: fewer than 2 means no approved alternative.
    db
      .select({
        id: materialCategories.id,
        name: materialCategories.name,
        accredited: sql<number>`count(${suppliers.id}) filter (where ${suppliers.status} in ('preferred','approved','conditional'))::int`,
      })
      .from(materialCategories)
      .leftJoin(supplierCategories, eq(supplierCategories.categoryId, materialCategories.id))
      .leftJoin(suppliers, eq(suppliers.id, supplierCategories.supplierId))
      .where(eq(materialCategories.isCritical, true))
      .groupBy(materialCategories.id, materialCategories.name)
      .orderBy(asc(materialCategories.name)),
  ]);

  const statusCount = Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Record<string, number>;
  const totalSuppliers = byStatus.reduce((s, r) => s + r.n, 0);
  const accredited = ACCREDITED_STATUSES.reduce((s, k) => s + (statusCount[k] ?? 0), 0);
  const evalCount = Object.fromEntries(evalStats.map((r) => [r.status, r.n])) as Record<string, number>;
  const evalTotal = evalStats.reduce((s, r) => s + r.n, 0);
  const critical = categoryCoverage.filter((c) => c.accredited < 2);
  const maxStatus = Math.max(1, ...SUPPLIER_STATUSES.map((s) => statusCount[s] ?? 0));
  const ca = caStats[0] ?? { open: 0, overdue: 0 };

  return (
    <>
      {/* Hero: the sign-in card's look — dark green with a white curved panel holding the illustration. */}
      <section className="bg-forest text-forest-foreground relative mb-6 overflow-hidden rounded-[1.75rem]">
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-white/[0.05]" />
        <div aria-hidden className="bg-highlight pointer-events-none absolute bottom-8 left-[55%] hidden size-3 rounded-full md:block" />
        <svg aria-hidden viewBox="0 0 400 300" preserveAspectRatio="none" className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[42%] md:block">
          <path d="M400 0H118C76 42 70 96 112 146C152 194 126 252 80 300H400Z" fill="#ffffff" />
        </svg>
        <div className="relative grid items-center gap-6 md:grid-cols-[1fr_40%]">
          <div className="p-6 md:p-10">
            <p className="text-highlight text-xs font-semibold tracking-wider uppercase">
              {quarterLabel(year, quarter)} · Supplier accreditation
            </p>
            <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Good day, {user.fullName.split(" ")[0]}</h1>
            <p className="text-forest-foreground/75 mt-2 max-w-md text-sm">
              {accredited} accredited of {totalSuppliers} registered suppliers
              {ca.overdue ? ` · ${ca.overdue} corrective action${ca.overdue === 1 ? "" : "s"} overdue` : ""}
              {pendingEvals.length + pendingCanvasses.length ? ` · ${pendingEvals.length + pendingCanvasses.length} waiting for approval` : ""}.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {can(user.role, "prepareCanvass") && (
                <Button asChild size="lg" className="bg-highlight text-highlight-foreground hover:bg-highlight/90 font-semibold">
                  <Link href="/canvass/new">
                    <PlusIcon /> New canvass
                  </Link>
                </Button>
              )}
              <Button asChild size="lg" variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white">
                <Link href="/evaluations">Quarterly evaluations</Link>
              </Button>
            </div>
          </div>
          <div className="relative hidden justify-center p-6 md:flex">
            <LoginIllustration className="w-full max-w-[300px]" />
          </div>
        </div>
      </section>

      {error === "forbidden" && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>You do not have access to that page.</AlertDescription>
        </Alert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile href="/suppliers" icon={BuildingIcon} label="Accredited suppliers" value={String(accredited)} sub={`of ${totalSuppliers} registered`} />
        <Tile
          icon={ClipboardCheckIcon}
          href="/evaluations"
          label={`${quarterLabel(year, quarter)} evaluations`}
          value={`${evalCount.approved ?? 0} / ${evalTotal}`}
          sub={evalTotal ? `${evalCount.submitted ?? 0} waiting for approval` : "Not started yet"}
        />
        <Tile
          icon={TriangleAlertIcon}
          href="/corrective-actions?status=overdue"
          label="Open corrective actions"
          value={String(ca.open)}
          sub={ca.overdue ? `${ca.overdue} overdue` : "None overdue"}
          alert={ca.overdue > 0}
        />
        <Tile href="/documents" icon={FileTextIcon} label="Documents expiring" value={String(expiring?.n ?? 0)} sub={`expired or within ${DOCUMENT_EXPIRY_WARNING_DAYS} days`} alert={(expiring?.n ?? 0) > 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Suppliers by status</CardTitle>
            <CardDescription>All {totalSuppliers} registered suppliers</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2.5" aria-label="Suppliers by status">
              {SUPPLIER_STATUSES.map((s) => {
                const n = statusCount[s] ?? 0;
                return (
                  <li key={s}>
                    <Link href={`/suppliers?status=${s}`} className="group grid grid-cols-[110px_1fr_36px] items-center gap-3 text-sm" title={`${SUPPLIER_STATUS_LABELS[s]}: ${n}`}>
                      <span className="text-muted-foreground group-hover:text-foreground">{SUPPLIER_STATUS_LABELS[s]}</span>
                      <span className="bg-secondary h-2.5 rounded-full">
                        <span className="bg-primary group-hover:bg-forest block h-2.5 rounded-full" style={{ width: `${(n / maxStatus) * 100}%`, minWidth: n ? 4 : 0 }} />
                      </span>
                      <span className="text-right tabular-nums">{n}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Critical materials without an alternative</CardTitle>
            <CardDescription>Critical categories with fewer than 2 accredited suppliers.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {categoryCoverage.length === 0 ? (
              <p className="text-muted-foreground px-6 text-sm">Mark categories as critical in Settings to track them here.</p>
            ) : critical.length === 0 ? (
              <p className="text-muted-foreground px-6 text-sm">Every critical category has at least 2 accredited suppliers.</p>
            ) : (
              <Table>
                <TableBody>
                  {critical.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-6">
                        <Link href={`/suppliers?category=${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Pill tone={c.accredited === 0 ? "red" : "amber"}>{c.accredited === 0 ? "No accredited supplier" : "Single source"}</Pill>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Waiting for approval</CardTitle>
            <CardDescription>Oldest first.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {pendingEvals.length + pendingCanvasses.length === 0 ? (
              <p className="text-muted-foreground px-6 text-sm">Nothing waiting.</p>
            ) : (
              <Table>
                <TableBody>
                  {pendingCanvasses.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-6">
                        <Link href={`/canvass/${c.id}`} className="font-medium hover:underline">
                          {c.title}
                        </Link>
                        <div className="text-muted-foreground text-xs">Selection Matrix · {c.reference}</div>
                      </TableCell>
                      <TableCell className="pr-6 text-right" />
                    </TableRow>
                  ))}
                  {pendingEvals.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="pl-6">
                        <Link href={`/evaluations/${e.id}`} className="font-medium hover:underline">
                          {e.name}
                        </Link>
                        <div className="text-muted-foreground text-xs">Quarterly evaluation · {quarterLabel(e.year, e.quarter)}</div>
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{fmtScore(e.score)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lowest-scoring accredited suppliers</CardTitle>
            <CardDescription>Candidates for close monitoring or alternative sourcing.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {lowest.length === 0 ? (
              <p className="text-muted-foreground px-6 text-sm">No scores yet.</p>
            ) : (
              <Table>
                <TableBody>
                  {lowest.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-6">
                        <Link href={`/suppliers/${s.id}`} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <SupplierStatusBadge status={s.status} />
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{fmtScore(s.score)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Tile({
  href,
  icon: Icon,
  label,
  value,
  sub,
  alert,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  alert?: boolean;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="group-hover:ring-primary/30 gap-1 py-5 transition-shadow group-hover:shadow-md">
        <CardContent className="flex items-start gap-4 px-5">
          <span className="bg-secondary text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums">{value}</p>
            <p className={alert ? "flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400" : "text-muted-foreground text-sm"}>
              {alert && <span className="size-1.5 rounded-full bg-red-600" aria-hidden />}
              {sub}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
