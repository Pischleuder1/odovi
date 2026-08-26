import "server-only";
import { createDb, type Db } from "@odovi/db";

/**
 * Server-only singleton database handle.
 *
 * Next.js may re-evaluate modules across HMR reloads and route bundles, so the
 * connection is cached on `globalThis` to avoid exhausting the Postgres
 * connection pool during development.
 */
const globalForDb = globalThis as unknown as { __odoviDb?: Db };

export const db: Db =
  globalForDb.__odoviDb ?? createDb(process.env.DATABASE_URL!);

if (process.env.NODE_ENV !== "production") {
  globalForDb.__odoviDb = db;
}
