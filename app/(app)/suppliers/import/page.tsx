import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { SupplierImport } from "@/components/suppliers/supplier-import";
import { db } from "@/lib/db";
import { materialCategories } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Import suppliers" };

export default async function ImportSuppliersPage() {
  await requireUser("manageSuppliers");
  const categories = await db.select({ name: materialCategories.name }).from(materialCategories).orderBy(asc(materialCategories.name));
  return (
    <>
      <PageHeader
        title="Import suppliers from Excel"
        description="Every imported supplier starts as a Prospect, the same as one registered by hand. Existing suppliers are never changed."
        back={{ href: "/suppliers", label: "Suppliers" }}
      />
      <SupplierImport categories={categories.map((c) => c.name)} />
    </>
  );
}
