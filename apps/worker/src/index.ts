import { createDb } from "@odovi/db";
import { createTeslamateClient, probeTeslamateSchema } from "./teslamate/client.js";
import { runSyncCycle } from "./sync/cycle.js";
import { requireEnv } from "./env.js";

const SYNC_INTERVAL_SECONDS = Number(process.env.SYNC_INTERVAL_SECONDS ?? "60");

const db = createDb(requireEnv("DATABASE_URL"));
const tm = createTeslamateClient(requireEnv("TESLAMATE_DATABASE_URL"));

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runSyncCycle(db, tm);
  } catch (err) {
    // Fehler ist bereits in sync_state protokolliert — nächster Tick versucht es neu.
    console.error(`[odovi-worker] sync fehlgeschlagen:`, err);
  } finally {
    running = false;
    timer = setTimeout(() => void tick(), SYNC_INTERVAL_SECONDS * 1000);
  }
}

function shutdown(signal: string): void {
  console.log(`[odovi-worker] received ${signal}, shutting down`);
  if (timer) clearTimeout(timer);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log(`[odovi-worker] starting, interval=${SYNC_INTERVAL_SECONDS}s`);
try {
  await probeTeslamateSchema(tm);
  console.log("[odovi-worker] TeslaMate-Schema ok");
} catch (err) {
  console.error(`[odovi-worker] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
void tick();
