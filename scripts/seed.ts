/**
 * Idempotent setup: storage bucket, reference data, default scoring templates and the first administrator.
 * Run with: npm run setup   (after `npm run db:migrate`)
 */
import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import * as schema from "../lib/db/schema";
import { QUARTERLY_BANDS, QUARTERLY_CRITERIA, SELECTION_BANDS, SELECTION_CRITERIA } from "../lib/scoring/defaults";

config({ path: ".env.local" });

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing from .env.local`);
  return v;
}

const CATEGORIES = [
  { name: "Bottles & Caps", description: "HDPE/PET bottles and caps, often on dedicated molds", isCritical: true },
  { name: "Drums & Pails", description: "Steel and plastic drums, pails", isCritical: true },
  { name: "Base Oils", description: "Mineral and synthetic base stocks", isCritical: true },
  { name: "Additives", description: "Additive packages and components", isCritical: true },
  { name: "Labels & Stickers", description: "Printed labels and stickers", isCritical: false },
  { name: "Cartons & Secondary Packaging", description: "Cartons, shrink film, pallets", isCritical: false },
];

const DOCUMENT_TYPES = [
  { name: "SEC / DTI Registration", isMandatory: true, hasExpiry: false, sortOrder: 10, description: "Certificate of registration of the business" },
  { name: "Mayor's / Business Permit", isMandatory: true, hasExpiry: true, sortOrder: 20, description: "Current year business permit" },
  { name: "BIR Certificate of Registration (Form 2303)", isMandatory: true, hasExpiry: false, sortOrder: 30 },
  { name: "Valid ID of Owner / Authorized Representative", isMandatory: false, hasExpiry: true, sortOrder: 40 },
  { name: "Latest Audited Financial Statement", isMandatory: false, hasExpiry: false, sortOrder: 50 },
  { name: "ISO Certification", isMandatory: false, hasExpiry: true, sortOrder: 60, description: "ISO 9001 or equivalent, if any" },
  { name: "Certificate of Analysis (sample)", isMandatory: false, hasExpiry: false, sortOrder: 70, description: "COA for the materials offered" },
  { name: "Safety Data Sheet (SDS)", isMandatory: false, hasExpiry: false, sortOrder: 80 },
  { name: "Customer References", isMandatory: false, hasExpiry: false, sortOrder: 90, description: "At least two customers we may contact" },
];

async function main() {
  const url = need("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = process.env.SUPABASE_DOCUMENTS_BUCKET ?? "supplier-documents";
  const client = postgres(process.env.DIRECT_URL ?? need("DATABASE_URL"), { prepare: false, max: 1 });
  const db = drizzle(client, { schema, casing: "snake_case" });
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Private storage bucket
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw listErr;
  if (!buckets.some((b) => b.name === bucket)) {
    const { error } = await supabase.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    });
    if (error) throw error;
    console.log(`✓ Created private bucket "${bucket}"`);
  } else console.log(`· Bucket "${bucket}" already exists`);

  // 2. Reference data
  for (const c of CATEGORIES) await db.insert(schema.materialCategories).values(c).onConflictDoNothing();
  for (const d of DOCUMENT_TYPES) await db.insert(schema.documentTypes).values(d).onConflictDoNothing();
  console.log("✓ Categories and document types");

  // 3. Default templates (only when the kind has none yet)
  for (const t of [
    { kind: "selection" as const, name: "Supplier Selection Matrix", criteria: SELECTION_CRITERIA, bands: SELECTION_BANDS },
    { kind: "quarterly" as const, name: "Quarterly Supplier Performance Evaluation", criteria: QUARTERLY_CRITERIA, bands: QUARTERLY_BANDS },
  ]) {
    const existing = await db.query.scoringTemplates.findFirst({
      where: and(eq(schema.scoringTemplates.kind, t.kind), isNull(schema.scoringTemplates.categoryId)),
    });
    if (!existing) {
      await db.insert(schema.scoringTemplates).values({ ...t, version: 1, isActive: true, changeNote: "Initial version from the Supplier Selection Matrix document." });
      console.log(`✓ Template: ${t.name} v1`);
    } else console.log(`· Template "${t.kind}" already exists`);
  }

  // 4. First administrator
  const email = need("SEED_ADMIN_EMAIL").toLowerCase();
  const password = need("SEED_ADMIN_PASSWORD");
  const fullName = process.env.SEED_ADMIN_NAME ?? "System Administrator";
  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error) throw error;
    userId = data.user.id;
    console.log(`✓ Created auth user ${email}`);
  }
  await db
    .insert(schema.profiles)
    .values({ id: userId, email, fullName, role: "admin" })
    .onConflictDoUpdate({ target: schema.profiles.id, set: { role: "admin", isActive: true } });
  console.log(`✓ Administrator profile for ${email}`);

  await client.end();
  console.log("\nSetup complete. Start the app with `npm run dev` and sign in.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
