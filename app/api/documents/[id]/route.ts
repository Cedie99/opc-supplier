import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { supplierDocuments } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { signedFileUrl } from "@/lib/storage";

/** Opens a supplier document: checks the staff session, then redirects to a 60-second signed URL. */
export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const doc = await db.query.supplierDocuments.findFirst({ where: eq(supplierDocuments.id, id), columns: { storagePath: true } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await signedFileUrl(doc.storagePath);
  return NextResponse.redirect(url);
}
