import { parseReleaseRuntimeConfig, unknownReleaseSettings } from "./index.js";

try {
  parseReleaseRuntimeConfig(process.env);
  const unknown = unknownReleaseSettings(process.env);
  if (unknown.length > 0) {
    throw new Error(
      `[odovi-config] unknown release setting(s): ${unknown.join(", ")}. ` +
        "Remove them or move development-only settings to a separate environment file. " +
        "See docs/runtime-configuration.md.",
    );
  }
  console.log("[odovi-config] release configuration is valid");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
