import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDb(url: string) {
  return createDbConnection(url).db;
}

export type Db = ReturnType<typeof createDb>;

/** Long-lived processes use this handle so shutdown can drain the client. */
export function createDbConnection(url: string) {
  // Operational probes and recovery screens must fail promptly when the
  // database disappears instead of leaving the HTTP process hanging.
  const client = postgres(url, { connect_timeout: 5 });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
