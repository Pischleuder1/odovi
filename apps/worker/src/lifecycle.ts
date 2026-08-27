export interface WorkerLoopOptions {
  intervalMs: number;
  runSlice: () => Promise<void>;
  close: () => Promise<void>;
  log?: (message: string, error?: unknown) => void;
}

export interface WorkerLoop {
  start: () => void;
  stop: (signal: string) => Promise<void>;
}

/**
 * Runs one synchronization slice at a time. A stop request cancels the next
 * timer, waits for the active slice, and only then closes database clients.
 */
export function createWorkerLoop(options: WorkerLoopOptions): WorkerLoop {
  const log = options.log ?? ((message, error) => console.log(message, error ?? ""));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let stopping = false;
  let closed = false;
  let resolveStopped: (() => void) | undefined;
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });

  async function finish(): Promise<void> {
    if (closed) return;
    closed = true;
    await options.close();
    resolveStopped?.();
  }

  async function tick(): Promise<void> {
    if (running || stopping) return;
    running = true;
    try {
      await options.runSlice();
    } catch (error) {
      log("[odovi-worker] sync failed; retrying after the configured interval", error);
    } finally {
      running = false;
      if (stopping) {
        await finish();
      } else {
        timer = setTimeout(() => void tick(), options.intervalMs);
      }
    }
  }

  return {
    start() {
      void tick();
    },
    async stop(signal: string) {
      if (!stopping) {
        stopping = true;
        if (timer) clearTimeout(timer);
        log(
          running
            ? `[odovi-worker] received ${signal}; finishing the active synchronization slice`
            : `[odovi-worker] received ${signal}; shutting down`,
        );
        if (!running) await finish();
      }
      await stopped;
    },
  };
}
