#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { assertReleaseMetadata, verifyCandidateRecord } from "./lib/release.mjs";

const [metadataPath, candidatePath, repository = process.env.GITHUB_REPOSITORY] = process.argv.slice(2);
if (!candidatePath) throw new Error("usage: verify-release-candidate.mjs <metadata> <candidate> [repository]");
const metadata = assertReleaseMetadata(JSON.parse(await readFile(metadataPath, "utf8")));
const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
verifyCandidateRecord(metadata, candidate, repository);
console.log(`Candidate ${candidate.candidate} is accepted for stable promotion.`);
