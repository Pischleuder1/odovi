import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAudit } from "./lib/production-audit.mjs";

const today = "2026-08-26";

function report(advisories) {
  return { advisories };
}

function advisory(overrides = {}) {
  return {
    github_advisory_id: "GHSA-test-1234-5678",
    module_name: "example-package",
    severity: "high",
    title: "Example vulnerability",
    vulnerable_versions: "<2.0.0",
    patched_versions: ">=2.0.0",
    ...overrides,
  };
}

function exception(overrides = {}) {
  return {
    advisoryId: "GHSA-test-1234-5678",
    package: "example-package",
    disposition: "temporarily_accepted",
    rationale: "Upgrade is blocked by an upstream runtime incompatibility.",
    owner: "security@example.invalid",
    expiresOn: "2026-09-30",
    ...overrides,
  };
}

test("fails a new high-severity production finding", () => {
  const result = evaluateAudit(report({ 1: advisory() }), [], today);

  assert.equal(result.unaccepted.length, 1);
  assert.deepEqual(result.errors, []);
});

test("ignores findings below high severity", () => {
  const result = evaluateAudit(
    report({ 1: advisory({ severity: "moderate" }) }),
    [],
    today,
  );

  assert.equal(result.unaccepted.length, 0);
  assert.deepEqual(result.errors, []);
});

test("accepts a matching, complete, unexpired exception", () => {
  const result = evaluateAudit(report({ 1: advisory() }), [exception()], today);

  assert.equal(result.unaccepted.length, 0);
  assert.equal(result.accepted.length, 1);
  assert.deepEqual(result.errors, []);
});

test("rejects expired or incomplete exceptions", () => {
  const result = evaluateAudit(
    report({ 1: advisory() }),
    [exception({ owner: "", expiresOn: "2026-08-25" })],
    today,
  );

  assert.match(result.errors.join("\n"), /non-empty owner/);
  assert.match(result.errors.join("\n"), /expired on 2026-08-25/);
});

test("rejects impossible expiry dates", () => {
  const result = evaluateAudit(
    report({ 1: advisory() }),
    [exception({ expiresOn: "2026-02-30" })],
    today,
  );

  assert.match(result.errors.join("\n"), /not a valid date/);
});

test("rejects stale exceptions after a finding disappears", () => {
  const result = evaluateAudit(report({}), [exception()], today);

  assert.match(result.errors.join("\n"), /Stale exception/);
});
