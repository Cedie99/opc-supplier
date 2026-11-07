import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { communicationLogs } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { signedFileUrl } from "@/lib/storage";

/** Opens a file a supplier attached to a request reply: checks the staff session, then redirects to a 60-second signed URL. */
export async function GET(_req: Request, ctx: RouteContext<"/api/requests/[id]/file">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const r = await db.query.communicationLogs.findFirst({ where: eq(communicationLogs.id, id), columns: { responseFile: true } });
  if (!r?.responseFile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(await signedFileUrl(r.responseFile.path));
}
