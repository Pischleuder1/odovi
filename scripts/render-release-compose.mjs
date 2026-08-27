#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

import { renderImmutableCompose } from "./lib/release.mjs";

const [templatePath, webDigest, workerDigest, output] = process.argv.slice(2);
if (!output) throw new Error("usage: render-release-compose.mjs <template> <web-digest> <worker-digest> <output>");
const template = await readFile(templatePath, "utf8");
await writeFile(output, renderImmutableCompose(template, webDigest, workerDigest), "utf8");
console.log(`Rendered immutable Compose asset at ${output}.`);
