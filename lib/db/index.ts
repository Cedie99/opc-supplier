import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

/**
 * Supabase's session pooler allows only 15 connections for ALL copies of the app together (each Vercel instance,
 * each developer's machine). A few connections per copy handle a page's parallel queries just as fast.
 */
const MAX_CONNECTIONS = 3;
/** Opened in the background at startup, so the first page doesn't pay ~0.5 s for a new connection. */
const WARM_CONNECTIONS = 1;

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Don't throw at import time (that would break `next build`); queries will fail with a clear message.
    console.warn("[db] DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  const client = postgres(url ?? "postgres://missing-database-url:5432/postgres", {
    // Required for Supabase's transaction pooler (port 6543).
    prepare: false,
    max: MAX_CONNECTIONS,
    // The pooler (and home/office routers) silently drop idle TCP connections. Reusing one of those makes a
    // query hang until the OS gives up, minutes later. Close idle connections first, and recycle old ones.
    // Closing them quickly also frees slots in the shared pool for other copies of the app.
    idle_timeout: 10, // seconds
    max_lifetime: 60 * 10, // seconds
    connect_timeout: 10, // seconds: fail fast instead of hanging
  });

  if (url && process.env.NEXT_PHASE !== "phase-production-build") {
    void Promise.all(Array.from({ length: WARM_CONNECTIONS }, () => client`select 1`)).catch(() => undefined);
  }
  return client;
}

// One pool per server process (also survives hot reloads in development).
const client = globalForDb.pgClient ?? createClient();
globalForDb.pgClient = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export type DB = typeof db;
export { schema };
