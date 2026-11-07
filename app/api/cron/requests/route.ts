import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sweepRequests } from "@/lib/requests";

/**
 * Hourly job: sends reminders after 1 business day and marks requests "no response" after 3.
 * Call with header `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this automatically when CRON_SECRET is set).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sweepRequests({ force: true });
  return NextResponse.json({ ok: true, ...result });
}
