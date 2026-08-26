#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import { releaseImageEvidence } from "./lib/release-image.mjs";

const [image, version, commit, platform, output] = process.argv.slice(2);
if (!image || !version || !commit || !platform || !output) {
  throw new Error("usage: verify-release-image.mjs <image> <version> <commit> <platform> <output>");
}

const result = spawnSync("docker", ["image", "inspect", image], { encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || `could not inspect ${image}`);
const inspected = JSON.parse(result.stdout)[0];
const evidence = releaseImageEvidence(inspected, { image, version, commit, platform });
await import("node:fs/promises").then(({ writeFile }) => writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`));
console.log(`Verified ${image} for ${platform}.`);
