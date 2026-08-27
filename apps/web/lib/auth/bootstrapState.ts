import "server-only";

import { sql } from "drizzle-orm";
import { users } from "@odovi/db";
import { db } from "../db";

/** Returns true when no administrator has been created yet. */
export async function usersTableIsEmpty(): Promise<boolean> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  return (rows[0]?.count ?? 0) === 0;
}
