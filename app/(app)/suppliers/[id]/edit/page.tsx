import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { db } from "@/lib/db";
import { materialCategories, supplierCategories, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { updateSupplier } from "../../actions";

export const metadata = { title: "Edit supplier" };

export default async function EditSupplierPage({ params }: PageProps<"/suppliers/[id]/edit">) {
  await requireUser("manageSuppliers");
  const { id } = await params;
  const [supplier, categories, selected] = await Promise.all([
    db.query.suppliers.findFirst({ where: eq(suppliers.id, id) }),
    db.select().from(materialCategories).orderBy(asc(materialCategories.name)),
    db.select().from(supplierCategories).where(eq(supplierCategories.supplierId, id)),
  ]);
  if (!supplier) notFound();
  return (
    <>
      <PageHeader title={`Edit ${supplier.name}`} description={supplier.code} back={{ href: `/suppliers/${id}`, label: supplier.name }} />
      <SupplierForm action={updateSupplier.bind(null, id)} supplier={supplier} categories={categories} selected={selected} submitLabel="Save changes" />
    </>
  );
}
