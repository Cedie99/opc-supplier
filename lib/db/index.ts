import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

/**
 * Uses Supabase's transaction pooler (port 6543), which suits serverless hosting: a connection is only held while a
 * query runs. The session pooler (port 5432) has just 15 slots, and frozen Vercel instances keep them occupied.
 * node-postgres queues queries in the app, one per connection; postgres.js stalled on this pooler when queries queued.
 */
const MAX_CONNECTIONS = 5;
/** Opened in the background at startup, so the first page doesn't pay ~0.5 s for a new connection. */
const WARM_CONNECTIONS = 1;

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Don't throw at import time (that would break `next build`); queries will fail with a clear message.
    console.warn("[db] DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  const pool = new Pool({
    connectionString: url ?? "postgres://missing-database-url:5432/postgres",
    max: MAX_CONNECTIONS,
    // The pooler (and home/office routers) silently drop idle TCP connections. Reusing one of those makes a
    // query hang until the OS gives up, minutes later. Close idle connections first, and recycle old ones.
    idleTimeoutMillis: 10_000,
    maxLifetimeSeconds: 60 * 10,
    connectionTimeoutMillis: 10_000, // fail fast instead of hanging
  });
  // A dropped idle connection must not crash the server; the pool replaces it on the next query.
  pool.on("error", (err) => console.error("[db] idle connection error", err.message));

  if (url && process.env.NEXT_PHASE !== "phase-production-build") {
    void Promise.all(Array.from({ length: WARM_CONNECTIONS }, () => pool.query("select 1"))).catch(() => undefined);
  }
  return pool;
}

// One pool per server process (also survives hot reloads in development).
const pool = globalForDb.pgPool ?? createPool();
globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });
export type DB = typeof db;
export { schema };
