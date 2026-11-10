import { addDays, format } from "date-fns";
import { asc, eq, ne } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/form/action-form";
import { SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form/fields";
import { db } from "@/lib/db";
import { profiles, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { CORRECTIVE_ACTION_DAYS } from "@/lib/corrective";
import { createCorrectiveAction } from "../actions";

export const metadata = { title: "New supplier concern" };

export default async function NewCorrectiveActionPage({ searchParams }: PageProps<"/corrective-actions/new">) {
  await requireUser("manageCorrectiveActions");
  const { supplier } = await searchParams;
  const [supplierRows, staff] = await Promise.all([
    db.select({ id: suppliers.id, name: suppliers.name, code: suppliers.code }).from(suppliers).where(ne(suppliers.status, "inactive")).orderBy(asc(suppliers.name)),
    db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles).where(eq(profiles.isActive, true)).orderBy(asc(profiles.fullName)),
  ]);
  return (
    <>
      <PageHeader title="New supplier concern" description="Record a supplier issue that needs a root cause and an improvement plan." back={{ href: "/corrective-actions", label: "Supplier concerns" }} />
      <Card>
        <CardContent>
          <ActionForm action={createCorrectiveAction} className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Supplier"
              name="supplierId"
              required
              defaultValue={typeof supplier === "string" ? supplier : undefined}
              placeholder="Choose…"
              options={supplierRows.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
            />
            <TextField label="Criterion (optional)" name="criterion" placeholder="e.g. On-Time Delivery" />
            <TextAreaField label="Issue" name="issue" rows={3} required className="md:col-span-2" />
            <SelectField label="Internal owner" name="ownerId" placeholder="Unassigned" options={staff.map((s) => ({ value: s.id, label: s.fullName }))} />
            <TextField label="Supplier contact" name="supplierContact" />
            <TextField
              label="Due date"
              name="dueDate"
              type="date"
              required
              defaultValue={format(addDays(new Date(), CORRECTIVE_ACTION_DAYS), "yyyy-MM-dd")}
            />
            <div className="flex items-end justify-end md:col-span-2">
              <SubmitButton>Open supplier concern</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
