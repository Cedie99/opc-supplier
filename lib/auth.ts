import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { can, type Permission } from "@/lib/permissions";

export type CurrentUser = typeof profiles.$inferSelect;

/** The signed-in staff member, or null. Cached for the duration of one request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  // Verifies the session token's signature locally (no round trip to Supabase Auth).
  // Revoked access is still enforced: the profile below must exist and be active.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const profile = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  if (!profile || !profile.isActive) return null;
  return profile;
});

/** For pages: redirects to /login when signed out, and to /dashboard when the role lacks the permission. */
export async function requireUser(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?error=no_profile");
  if (permission && !can(user.role, permission)) redirect("/dashboard?error=forbidden");
  return user;
}

export class ActionError extends Error {}

/** For server actions: throws instead of redirecting, so the form can show the message. */
export async function authorize(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("Your session has expired. Please sign in again.");
  if (permission && !can(user.role, permission)) throw new ActionError("You do not have permission to do this.");
  return user;
}
