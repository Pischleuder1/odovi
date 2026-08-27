import { randomBytes } from "node:crypto";

const issuedAtSeconds = Math.floor(Date.now() / 1000);
const secret = randomBytes(32).toString("hex");
process.stdout.write(`v1.${issuedAtSeconds}.${secret}\n`);
