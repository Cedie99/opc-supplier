import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { db } from "@/lib/db";
import { materialCategories } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { createSupplier } from "../actions";

export const metadata = { title: "New supplier" };

export default async function NewSupplierPage() {
  await requireUser("manageSuppliers");
  const categories = await db.select().from(materialCategories).orderBy(asc(materialCategories.name));
  return (
    <>
      <PageHeader
        title="Register a supplier"
        description="The supplier starts as a Prospect. It becomes accredited after its documents are verified and a Selection Matrix is approved."
        back={{ href: "/suppliers", label: "Suppliers" }}
      />
      <SupplierForm action={createSupplier} categories={categories} submitLabel="Register supplier" />
    </>
  );
}
