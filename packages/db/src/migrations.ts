/**
 * Latest migration required by this source revision.
 *
 * Keep this value in sync with drizzle/meta/_journal.json. Runtime images do
 * not ship the journal to the web container, so readiness needs a compiled
 * contract instead of reading build-time files from disk.
 */
export const REQUIRED_DATABASE_MIGRATION = {
  tag: "0008_boring_the_enforcers",
  appliedAt: 1_787_776_816_727,
} as const;
