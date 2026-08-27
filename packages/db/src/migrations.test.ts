import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_DATABASE_MIGRATION } from "./migrations.js";

describe("required database migration", () => {
  it("matches the latest Drizzle journal entry", () => {
    const journal = JSON.parse(
      readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    ) as { entries: Array<{ tag: string; when: number }> };
    const latest = journal.entries.at(-1);
    expect(REQUIRED_DATABASE_MIGRATION).toEqual({
      tag: latest?.tag,
      appliedAt: latest?.when,
    });
  });
});
