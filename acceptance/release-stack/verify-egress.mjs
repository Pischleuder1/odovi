import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const expectZero = args.includes("--expect-zero");
const files = args.filter((arg) => arg !== "--expect-zero");
const entries = files.flatMap((file) => {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
});
const uncontrolled = entries.filter((entry) => entry.controlled !== true);

console.log(
  JSON.stringify(
    {
      requests: entries.length,
      controlled: entries.length - uncontrolled.length,
      uncontrolled: uncontrolled.length,
      expectZero,
      failures: uncontrolled,
    },
    null,
    2,
  ),
);

if (uncontrolled.length > 0 || (expectZero && entries.length > 0)) process.exit(1);
