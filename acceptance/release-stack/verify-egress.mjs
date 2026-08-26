import { existsSync, readFileSync } from "node:fs";

const files = process.argv.slice(2);
const entries = files.flatMap((file) => {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
});
const undeclared = entries.filter((entry) => entry.declared !== true);

console.log(
  JSON.stringify(
    {
      requestsBlocked: entries.length,
      declaredRequestsBlocked: entries.length - undeclared.length,
      undeclaredRequestsBlocked: undeclared.length,
      undeclared,
    },
    null,
    2,
  ),
);

if (undeclared.length > 0) process.exit(1);
