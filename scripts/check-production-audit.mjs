import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import { evaluateAudit } from "./lib/production-audit.mjs";

const exceptionFile = new URL("../security/dependency-audit-exceptions.json", import.meta.url);

function runAudit() {
  const pnpmCli = process.env.npm_execpath;
  const command = pnpmCli ? process.execPath : "corepack";
  const args = pnpmCli
    ? [pnpmCli, "audit", "--prod", "--json"]
    : ["pnpm", "audit", "--prod", "--json"];
  const result = spawnSync(command, args, { encoding: "utf8" });

  if (result.error) {
    throw result.error;
  }

  try {
    const report = JSON.parse(result.stdout);
    if (report.error) {
      throw new Error(report.error.summary ?? report.error.message ?? "pnpm audit failed");
    }
    return report;
  } catch (error) {
    const stderr = result.stderr.trim();
    throw new Error(`Could not parse pnpm audit output: ${error.message}${stderr ? `\n${stderr}` : ""}`);
  }
}

function findingLabel(finding) {
  return `${finding.severity.toUpperCase()} ${finding.advisoryId} in ${finding.package}: ${finding.title}`;
}

try {
  const exceptions = JSON.parse(await readFile(exceptionFile, "utf8"));
  const report = runAudit();
  const result = evaluateAudit(report, exceptions);
  const counts = report.metadata?.vulnerabilities ?? {};

  console.log(
    `Production audit: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ` +
      `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low.`,
  );

  for (const { finding, exception } of result.accepted) {
    console.log(
      `ACCEPTED ${findingLabel(finding)} (${exception.disposition}, owner: ${exception.owner}, ` +
        `expires: ${exception.expiresOn})`,
    );
  }

  for (const finding of result.unaccepted) {
    console.error(`BLOCKED ${findingLabel(finding)}`);
  }

  for (const error of result.errors) {
    console.error(`INVALID EXCEPTION: ${error}`);
  }

  if (result.unaccepted.length > 0 || result.errors.length > 0) {
    process.exitCode = 1;
  } else {
    console.log("Production dependency gate passed.");
  }
} catch (error) {
  console.error(`Production dependency gate could not run: ${error.message}`);
  process.exitCode = 1;
}
