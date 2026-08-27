#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

import { assertReleaseMetadata, createCandidateRecord } from "./lib/release.mjs";

const [metadataPath, sourceCommit, webDigest, workerDigest, acceptancePath, output] = process.argv.slice(2);
if (!output) {
  throw new Error("usage: create-release-candidate.mjs <metadata> <commit> <web-digest> <worker-digest> <acceptance-manifest> <output>");
}
const metadata = assertReleaseMetadata(JSON.parse(await readFile(metadataPath, "utf8")));
const acceptance = JSON.parse(await readFile(acceptancePath, "utf8"));
const record = createCandidateRecord(metadata, { sourceCommit, webDigest, workerDigest, acceptance });
await writeFile(output, `${JSON.stringify(record, null, 2)}\n`, "utf8");
console.log(`Created ${record.candidate} record; accepted=${record.accepted}.`);
