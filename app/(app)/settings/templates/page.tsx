import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { db } from "@/lib/db";
import { materialCategories, profiles, scoringTemplates } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { TEMPLATE_KINDS, TEMPLATE_KIND_LABELS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Scoring templates" };

export default async function TemplatesPage() {
  await requireUser("manageSettings");
  const [rows, categories] = await Promise.all([
    db
      .select({ t: scoringTemplates, category: materialCategories.name, author: profiles.fullName })
      .from(scoringTemplates)
      .leftJoin(materialCategories, eq(materialCategories.id, scoringTemplates.categoryId))
      .leftJoin(profiles, eq(profiles.id, scoringTemplates.createdBy))
      .orderBy(asc(scoringTemplates.kind), asc(materialCategories.name), desc(scoringTemplates.version)),
    db.select().from(materialCategories).orderBy(asc(materialCategories.name)),
  ]);

  return (
    <>
      <PageHeader
        title="Scoring templates"
        description="Criteria, weights, thresholds and classification bands. Each save is a new version; past scores are never recalculated."
      />
      <div className="grid gap-6">
        {TEMPLATE_KINDS.map((kind) => {
          const list = rows.filter((r) => r.t.kind === kind);
          return (
            <Card key={kind}>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>{TEMPLATE_KIND_LABELS[kind]}</CardTitle>
                  <CardDescription>A category can have its own template (for example stricter quality thresholds for bottles); otherwise the general one applies.</CardDescription>
                </div>
                <details className="relative">
                  <summary className="cursor-pointer list-none">
                    <span className="border-border hover:bg-muted inline-flex h-7 items-center rounded-lg border px-2.5 text-sm">Category template…</span>
                  </summary>
                  <div className="bg-popover absolute right-0 z-10 mt-1 grid w-56 gap-1 rounded-lg border p-1 shadow-md">
                    {categories.map((c) => (
                      <Link key={c.id} href={`/settings/templates/new?kind=${kind}&category=${c.id}`} className="hover:bg-muted rounded px-2 py-1 text-sm">
                        {c.name}
                      </Link>
                    ))}
                    {categories.length === 0 && <span className="text-muted-foreground px-2 py-1 text-sm">No categories yet</span>}
                  </div>
                </details>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Template</TableHead>
                      <TableHead>Applies to</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Saved</TableHead>
                      <TableHead className="pr-6" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map(({ t, category, author }) => (
                      <TableRow key={t.id}>
                        <TableCell className="pl-6">
                          <Link href={`/settings/templates/${t.id}`} className="font-medium hover:underline">
                            {t.name}
                          </Link>
                          {t.changeNote && <div className="text-muted-foreground max-w-md truncate text-xs">{t.changeNote}</div>}
                        </TableCell>
                        <TableCell className="text-sm">{category ?? "General"}</TableCell>
                        <TableCell>
                          v{t.version} {t.isActive && <Pill tone="green">Active</Pill>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {fmtDate(t.createdAt)}
                          {author && ` · ${author}`}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Button size="xs" variant="outline" asChild>
                            <Link href={`/settings/templates/${t.id}`}>{t.isActive ? "Edit" : "View"}</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
