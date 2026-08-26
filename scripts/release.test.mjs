import assert from "node:assert/strict";
import test from "node:test";

import {
  assertReleaseMetadata,
  createCandidateRecord,
  renderImmutableCompose,
  verifyCandidateRecord,
} from "./lib/release.mjs";
import { releaseImageEvidence } from "./lib/release-image.mjs";

const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;
const commit = "c".repeat(40);
const metadata = {
  schemaVersion: 1,
  version: "0.2.0",
  candidate: "0.2.0-rc.1",
  images: { web: "ghcr.io/jsc2304/odovi-web", worker: "ghcr.io/jsc2304/odovi-worker" },
  architectures: ["linux/amd64", "linux/arm64"],
  requiredAcceptanceIssues: [27],
  packages: ["package.json"],
  supportedRuntimes: { application: "Node.js 22" },
  teslaMateRange: "4.0.1 through 4.2.0",
  testedPlatforms: [{ platform: "linux/amd64", coverage: "acceptance" }],
  knownLimitations: ["native arm64 acceptance pending"],
};

function acceptance(enforced = true) {
  return {
    status: "passed",
    gitCommit: commit,
    version: metadata.version,
    startedAt: "2026-08-26T10:00:00Z",
    finishedAt: "2026-08-26T10:10:00Z",
    dependencyGates: [{ issue: 27, enforced }],
  };
}

test("creates an accepted candidate only when every acceptance dependency ran", () => {
  const accepted = createCandidateRecord(metadata, {
    sourceCommit: commit,
    webDigest: digestA,
    workerDigest: digestB,
    acceptance: acceptance(true),
    createdAt: "2026-08-26T10:11:00Z",
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.images.web.reference, `${metadata.images.web}@${digestA}`);
  assert.doesNotThrow(() => verifyCandidateRecord(metadata, accepted, "jsc2304/odovi"));

  const incomplete = createCandidateRecord(metadata, {
    sourceCommit: commit,
    webDigest: digestA,
    workerDigest: digestB,
    acceptance: acceptance(false),
  });
  assert.equal(incomplete.accepted, false);
  assert.throws(() => verifyCandidateRecord(metadata, incomplete, "jsc2304/odovi"), /not accepted/);
});

test("rejects inconsistent candidate input", () => {
  assert.throws(
    () => createCandidateRecord(metadata, {
      sourceCommit: "d".repeat(40),
      webDigest: digestA,
      workerDigest: digestB,
      acceptance: acceptance(true),
    }),
    /acceptance commit/,
  );
  assert.throws(() => assertReleaseMetadata({ ...metadata, candidate: "0.3.0-rc.1" }), /prerelease/);
});

test("renders every release digest reference without changing source-build variables", () => {
  const template = [
    "# Supply ODOVI_WEB_DIGEST and ODOVI_WORKER_DIGEST from the record.",
    "image: ghcr.io/jsc2304/odovi-web@${ODOVI_WEB_DIGEST:?required}",
    "image: ghcr.io/jsc2304/odovi-worker@${ODOVI_WORKER_DIGEST:?required}",
    "environment: ${POSTGRES_PASSWORD:?required}",
  ].join("\n");
  const rendered = renderImmutableCompose(template, digestA, digestB);
  assert.match(rendered, new RegExp(digestA));
  assert.match(rendered, new RegExp(digestB));
  assert.match(rendered, /\$\{POSTGRES_PASSWORD:\?required\}/);
});

test("verifies the built architecture and both OCI identity labels", () => {
  const inspected = {
    Id: digestA,
    Architecture: "arm64",
    Config: {
      Labels: {
        "org.opencontainers.image.version": metadata.version,
        "org.opencontainers.image.revision": commit,
      },
    },
  };
  const evidence = releaseImageEvidence(inspected, {
    image: "local/odovi-web:test",
    version: metadata.version,
    commit,
    platform: "linux/arm64",
  });
  assert.equal(evidence.architecture, "arm64");
  assert.throws(
    () => releaseImageEvidence(inspected, {
      image: "local/odovi-web:test",
      version: "0.2.1",
      commit,
      platform: "linux/arm64",
    }),
    /version label/,
  );
});
