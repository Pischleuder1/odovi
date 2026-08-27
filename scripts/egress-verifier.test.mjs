import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const verifier = new URL("../acceptance/release-stack/verify-egress.mjs", import.meta.url).pathname;
const directory = mkdtempSync(join(tmpdir(), "odovi-egress-"));
const run = (...args) => spawnSync(process.execPath, [verifier, ...args], { encoding: "utf8" });

test("zero-egress checkpoint rejects a premature controlled request", () => {
  const log = join(directory, "premature.ndjson");
  writeFileSync(log, `${JSON.stringify({ controlled: true, host: "provider" })}\n`);
  assert.notEqual(run("--expect-zero", log).status, 0);
});

test("final egress gate rejects undeclared destinations", () => {
  const log = join(directory, "undeclared.ndjson");
  writeFileSync(log, `${JSON.stringify({ controlled: false, host: "example.com" })}\n`);
  assert.notEqual(run(log).status, 0);
});

test("final egress gate accepts only controlled requests", () => {
  const log = join(directory, "controlled.ndjson");
  writeFileSync(log, `${JSON.stringify({ controlled: true, host: "provider" })}\n`);
  assert.equal(run(log).status, 0);
});
