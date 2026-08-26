import {
  parseMigrationRuntimeConfig,
  parseWebRuntimeConfig,
  parseWorkerRuntimeConfig,
} from "./index.js";

const scope = process.argv[2];

try {
  if (scope === "web") parseWebRuntimeConfig(process.env);
  else if (scope === "worker") parseWorkerRuntimeConfig(process.env);
  else if (scope === "migrate") parseMigrationRuntimeConfig(process.env);
  else throw new Error("usage: process-check <web|worker|migrate>");
  console.log(`[odovi-config] ${scope} runtime configuration is valid`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
