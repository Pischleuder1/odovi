import { resolveBuildInfo } from "@odovi/core";
import { createDbConnection } from "@odovi/db";
import { parseWorkerRuntimeConfig } from "@odovi/runtime-config";
import { createWorkerLoop } from "./lifecycle.js";
import { workerErrorCode } from "./operationalStatus.js";
import { runSyncCycle } from "./sync/cycle.js";
import { recordSyncRun } from "./sync/state.js";
import { createTeslamateClient, probeTeslamateSchema } from "./teslamate/client.js";

async function main(): Promise<void> {
  // Validate before opening clients or entering a long-running retry loop.
  const config = parseWorkerRuntimeConfig(process.env);
  const buildInfo = resolveBuildInfo({
    ODOVI_VERSION: process.env.ODOVI_VERSION,
    ODOVI_COMMIT_SHA: process.env.ODOVI_COMMIT_SHA,
  });
  const connection = createDbConnection(config.databaseUrl);
  const tm = createTeslamateClient(config.teslamateDatabaseUrl);

  try {
    await probeTeslamateSchema(tm);
    await recordSyncRun(connection.db, "teslamate", "schema", {
      status: "ok",
      rowsUpserted: 0,
    });
    console.log("[odovi-worker] TeslaMate schema ok");
  } catch (error) {
    try {
      await recordSyncRun(connection.db, "teslamate", "schema", {
        status: "error",
        error: workerErrorCode(error),
        rowsUpserted: 0,
      });
    } catch (statusError) {
      console.error("[odovi-worker] could not persist TeslaMate schema status", statusError);
    }
    await Promise.all([connection.close(), tm.end({ timeout: 1 })]);
    throw error;
  }

  const loop = createWorkerLoop({
    intervalMs: config.syncIntervalSeconds * 1000,
    runSlice: async () => {
      try {
        await runSyncCycle(connection.db, tm, {
          appTimezone: config.appTimezone,
          elevationMaxPointsPerCycle: config.elevationMaxPointsPerCycle,
        });
        await recordSyncRun(connection.db, "odovi", "worker", {
          status: "ok",
          rowsUpserted: 0,
        });
      } catch (error) {
        try {
          await recordSyncRun(connection.db, "odovi", "worker", {
            status: "error",
            error: workerErrorCode(error),
            rowsUpserted: 0,
          });
        } catch (statusError) {
          console.error("[odovi-worker] could not persist worker status", statusError);
        }
        throw error;
      }
    },
    close: async () => {
      await Promise.all([connection.close(), tm.end({ timeout: 5 })]);
      console.log("[odovi-worker] shutdown complete");
    },
    log: (message, error) => {
      if (error == null) console.log(message);
      else console.error(message, error);
    },
  });

  process.once("SIGINT", () => void loop.stop("SIGINT"));
  process.once("SIGTERM", () => void loop.stop("SIGTERM"));

  console.log(
    `[odovi-worker] starting, version=${buildInfo.version}, build=${buildInfo.commit}, interval=${config.syncIntervalSeconds}s`,
  );
  loop.start();
}

void main().catch((error) => {
  console.error(`[odovi-worker] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
