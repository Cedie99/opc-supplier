import "server-only";
import { db, type DB } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Adds an in-app notification for each user (shown under the bell). */
export async function notify(userIds: (string | null | undefined)[], n: { title: string; body?: string; href?: string }, tx: DB | Tx = db) {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return;
  await tx.insert(notifications).values(ids.map((userId) => ({ userId, title: n.title, body: n.body, href: n.href })));
}
