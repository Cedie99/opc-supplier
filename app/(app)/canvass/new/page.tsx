import { asc, ne, sql } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/form/action-form";
import { SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form/fields";
import { SupplierPicker } from "@/components/scoring/supplier-picker";
import { db } from "@/lib/db";
import { materialCategories, supplierCategories, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { createCanvass } from "../actions";

export const metadata = { title: "New canvass" };

export default async function NewCanvassPage() {
  await requireUser("prepareCanvass");
  const [categories, supplierRows] = await Promise.all([
    db.select().from(materialCategories).orderBy(asc(materialCategories.name)),
    db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        code: suppliers.code,
        status: suppliers.status,
        categoryIds: sql<string[]>`coalesce((select array_agg(sc.category_id) from ${supplierCategories} sc where sc.supplier_id = ${suppliers.id}), '{}')`,
      })
      .from(suppliers)
      .where(ne(suppliers.status, "inactive"))
      .orderBy(asc(suppliers.name)),
  ]);

  return (
    <>
      <PageHeader
        title="New canvass"
        description="Compare quotations from at least 2–3 suppliers offering equivalent specifications."
        back={{ href: "/canvass", label: "Selection Matrix" }}
      />
      <ActionForm action={createCanvass} className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>What are you sourcing?</CardTitle>
            <CardDescription>The category decides which Selection Matrix template is used.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <TextField label="Title" name="title" required placeholder="e.g. 1L HDPE bottle — alternative supplier" />
            <SelectField label="Material category" name="categoryId" placeholder="General" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
            <TextAreaField label="Material and specifications" name="materialDescription" rows={3} className="md:col-span-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Suppliers to compare</CardTitle>
            <CardDescription>You can also add suppliers later. Register a new prospect under Suppliers first if it is not listed.</CardDescription>
          </CardHeader>
          <CardContent>
            <SupplierPicker suppliers={supplierRows} />
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <SubmitButton pendingText="Creating…">Create canvass</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
