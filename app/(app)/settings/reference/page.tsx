import { asc } from "drizzle-orm";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { FormDialog } from "@/components/form/form-dialog";
import { CheckboxField, TextAreaField, TextField } from "@/components/form/fields";
import { db } from "@/lib/db";
import { documentTypes, holidays, materialCategories } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { deleteHoliday, saveCategory, saveDocumentType, saveHoliday } from "../actions";
import { ConfirmActionButton } from "@/components/scoring/decision-panel";
import { BUSINESS_HOURS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Categories & documents" };

type Category = typeof materialCategories.$inferSelect;
type DocType = typeof documentTypes.$inferSelect;

export default async function ReferencePage() {
  await requireUser("manageSettings");
  const [categories, docTypes, holidayRows] = await Promise.all([
    db.select().from(materialCategories).orderBy(asc(materialCategories.name)),
    db.select().from(documentTypes).orderBy(asc(documentTypes.sortOrder), asc(documentTypes.name)),
    db.select().from(holidays).orderBy(asc(holidays.date)),
  ]);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const workDays = BUSINESS_HOURS.workDays.map((d) => days[d]);

  return (
    <>
      <PageHeader title="Categories & documents" description="Material categories and the documents required for accreditation." />
      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Material categories</CardTitle>
              <CardDescription>Critical categories are tracked on the dashboard until they have at least 2 accredited suppliers.</CardDescription>
            </div>
            <CategoryDialog />
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Critical</TableHead>
                  <TableHead className="pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-6 font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.description ?? "—"}</TableCell>
                    <TableCell>{c.isCritical ? <Pill tone="violet">Critical</Pill> : "—"}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <CategoryDialog category={c} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Document types</CardTitle>
              <CardDescription>The Supplier Accreditation Checklist. Mandatory documents must be verified and valid before accreditation.</CardDescription>
            </div>
            <DocTypeDialog />
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Order</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Rules</TableHead>
                  <TableHead className="pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {docTypes.map((d) => (
                  <TableRow key={d.id} className={d.isActive ? "" : "opacity-60"}>
                    <TableCell className="pl-6 tabular-nums">{d.sortOrder}</TableCell>
                    <TableCell>
                      <span className="font-medium">{d.name}</span>
                      {d.description && <span className="text-muted-foreground block text-xs">{d.description}</span>}
                    </TableCell>
                    <TableCell className="flex flex-wrap gap-1">
                      {d.isMandatory && <Pill tone="red">Mandatory</Pill>}
                      {d.hasExpiry && <Pill tone="amber">Has expiry</Pill>}
                      {!d.isActive && <Pill tone="gray">Inactive</Pill>}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <DocTypeDialog docType={d} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Holidays</CardTitle>
              <CardDescription>
                Supplier response times count business hours only ({workDays[0]}–{workDays[workDays.length - 1]}, {BUSINESS_HOURS.startHour}:00–{BUSINESS_HOURS.endHour}:00
                Philippine time). Days listed here are skipped too.
              </CardDescription>
            </div>
            <FormDialog
              trigger={
                <Button size="sm">
                  <PlusIcon /> Add holiday
                </Button>
              }
              title="Add a holiday"
              action={saveHoliday}
            >
              <TextField label="Date" name="date" type="date" required />
              <TextField label="Name" name="name" required placeholder="e.g. Bonifacio Day" />
            </FormDialog>
          </CardHeader>
          <CardContent className="px-0">
            {holidayRows.length === 0 ? (
              <p className="text-muted-foreground px-6 text-sm">No holidays added yet.</p>
            ) : (
              <Table>
                <TableBody>
                  {holidayRows.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="pl-6 font-medium">{fmtDate(h.date)}</TableCell>
                      <TableCell>{h.name}</TableCell>
                      <TableCell className="pr-6 text-right">
                        <ConfirmActionButton action={deleteHoliday.bind(null, h.id)} label="Remove" confirmLabel={`Remove ${h.name}?`} variant="ghost" />
                      </TableCell>
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

function CategoryDialog({ category }: { category?: Category }) {
  return (
    <FormDialog
      trigger={
        category ? (
          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${category.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button size="sm">
            <PlusIcon /> Add category
          </Button>
        )
      }
      title={category ? `Edit ${category.name}` : "Add a material category"}
      action={saveCategory.bind(null, category?.id ?? null)}
    >
      <TextField label="Name" name="name" required defaultValue={category?.name} />
      <TextAreaField label="Description" name="description" rows={2} defaultValue={category?.description ?? ""} />
      <CheckboxField name="isCritical" label="Critical material" hint="Needs at least one approved alternative supplier." defaultChecked={category?.isCritical} />
    </FormDialog>
  );
}

function DocTypeDialog({ docType }: { docType?: DocType }) {
  return (
    <FormDialog
      trigger={
        docType ? (
          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${docType.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button size="sm">
            <PlusIcon /> Add document type
          </Button>
        )
      }
      title={docType ? `Edit ${docType.name}` : "Add a document type"}
      action={saveDocumentType.bind(null, docType?.id ?? null)}
    >
      <TextField label="Name" name="name" required defaultValue={docType?.name} />
      <TextAreaField label="Description (shown to suppliers)" name="description" rows={2} defaultValue={docType?.description ?? ""} />
      <TextField label="Display order" name="sortOrder" type="number" min={0} defaultValue={docType?.sortOrder ?? 0} />
      <CheckboxField name="isMandatory" label="Mandatory" hint="Missing, rejected or expired blocks accreditation." defaultChecked={docType?.isMandatory} />
      <CheckboxField name="hasExpiry" label="Has an expiry date" defaultChecked={docType?.hasExpiry} />
      <CheckboxField name="isActive" label="Active" defaultChecked={docType?.isActive ?? true} />
    </FormDialog>
  );
}
