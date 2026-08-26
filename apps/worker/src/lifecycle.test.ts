import { describe, expect, it, vi } from "vitest";
import { createWorkerLoop } from "./lifecycle.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("worker lifecycle", () => {
  it("waits for the active synchronization slice before closing", async () => {
    const slice = deferred();
    const close = vi.fn(async () => {});
    const loop = createWorkerLoop({
      intervalMs: 60_000,
      runSlice: () => slice.promise,
      close,
      log: vi.fn(),
    });

    loop.start();
    await Promise.resolve();
    const stopped = loop.stop("SIGTERM");
    await Promise.resolve();
    expect(close).not.toHaveBeenCalled();

    slice.resolve();
    await stopped;
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes immediately when waiting between slices", async () => {
    vi.useFakeTimers();
    const close = vi.fn(async () => {});
    const loop = createWorkerLoop({
      intervalMs: 60_000,
      runSlice: vi.fn(async () => {}),
      close,
      log: vi.fn(),
    });

    loop.start();
    await vi.runAllTicks();
    await loop.stop("SIGINT");
    expect(close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
