#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import { releaseImageEvidence } from "./lib/release-image.mjs";

const [image, version, commit, platform, output] = process.argv.slice(2);
if (!image || !version || !commit || !platform || !output) {
  throw new Error("usage: verify-release-image.mjs <image> <version> <commit> <platform> <output>");
}

const result = spawnSync("docker", ["image", "inspect", image], { encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || `could not inspect ${image}`);
const inspected = JSON.parse(result.stdout)[0];
const evidence = releaseImageEvidence(inspected, { image, version, commit, platform });

// docker create/cp checks the filesystem without executing a foreign-architecture
// image. See https://docs.docker.com/reference/cli/docker/container/cp/.
const temporary = mkdtempSync(join(tmpdir(), "odovi-image-notices-"));
let container;
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "Image notice verification failed");
  return result.stdout.trim();
}
try {
  container = docker(["create", "--platform", platform, "--network", "none", "--entrypoint", "node", image, "-e", "process.exit(0)"]);
  docker(["cp", `${container}:/app/LICENSE`, join(temporary, "LICENSE")]);
  docker(["cp", `${container}:/app/third-party-licenses`, join(temporary, "third-party-licenses")]);
  const license = readFileSync(join(temporary, "LICENSE"), "utf8");
  if (!license.includes("FSL-1.1-ALv2")) throw new Error("Application license is missing from the image");
  const inventoryRoot = join(temporary, "third-party-licenses");
  const rawInventory = readFileSync(join(inventoryRoot, "inventory.json"));
  const inventory = JSON.parse(rawInventory);
  if (!inventory.packages?.length) throw new Error("Production license inventory is empty");
  const lockfile = readFileSync(new URL("../pnpm-lock.yaml", import.meta.url));
  if (inventory.lockfileSha256 !== createHash("sha256").update(lockfile).digest("hex")) {
    throw new Error("Image license inventory does not match the source lockfile");
  }
  let noticeCount = 0;
  for (const dependency of inventory.packages) {
    const files = [...dependency.notices, ...dependency.standardLicenseTexts];
    if (!files.length) throw new Error(`Missing notices for ${dependency.name}`);
    for (const file of files) {
      const path = resolve(inventoryRoot, file);
      if (!path.startsWith(inventoryRoot + sep) || !readFileSync(path).length) {
        throw new Error(`Invalid notice file for ${dependency.name}`);
      }
      noticeCount++;
    }
  }
  evidence.licenses = { packages: inventory.packages.length, noticeFiles: noticeCount,
    inventorySha256: createHash("sha256").update(rawInventory).digest("hex") };
} finally {
  if (container) docker(["rm", container]);
  rmSync(temporary, { recursive: true, force: true });
}
await import("node:fs/promises").then(({ writeFile }) => writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`));
console.log(`Verified ${image} for ${platform}.`);
