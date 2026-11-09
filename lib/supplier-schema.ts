import { z } from "zod";
import { MOLD_OWNERSHIP, SUPPLIER_TIERS } from "@/lib/constants";
import { zBool, zRequired, zText } from "@/lib/zod-fields";

const optionalInt = z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(0).max(100000).optional());

/** The company details of a supplier, whether typed into the form or read from an Excel file. */
export const supplierSchema = z.object({
  name: zRequired("Company name"),
  tradeName: zText(200),
  contactPerson: zText(200),
  email: z.email("Enter a valid email.").optional(),
  phone: zText(100),
  address: zText(500),
  tin: zText(50),
  website: zText(300),
  yearEstablished: z.preprocess(
    (v) => (v === undefined ? undefined : Number(v)),
    z.number().int().min(1800, "Enter a valid year.").max(new Date().getFullYear(), "Enter a valid year.").optional(),
  ),
  creditTermsDays: optionalInt,
  tier: z.enum(SUPPLIER_TIERS),
  isSingleSource: zBool,
  moldOwnership: z.enum(MOLD_OWNERSHIP),
  erpVendorCode: zText(50),
  notes: zText(2000),
});

export type SupplierDetails = z.infer<typeof supplierSchema>;
