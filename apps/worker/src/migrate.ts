import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { parseMigrationRuntimeConfig } from "@odovi/runtime-config";

/**
 * One-shot migration runner for production. Runs drizzle-orm's migrator
 * against the compiled `drizzle/` SQL folder that ships in the worker image —
 * no drizzle-kit (and no dev dependencies) required at runtime.
 *
 * Used by the `migrate` service in docker-compose.yml:
 *   node dist/migrate.js
 */
async function main(): Promise<void> {
  const { databaseUrl: url } = parseMigrationRuntimeConfig(process.env);
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  console.log("[odovi-migrate] running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[odovi-migrate] done.");

  await client.end();
  process.exit(0);
}

void main().catch((err) => {
  console.error("[odovi-migrate] failed:", err);
  process.exit(1);
});
