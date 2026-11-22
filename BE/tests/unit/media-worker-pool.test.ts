import { describe, expect, it, vi } from "vitest";
import type { Worker } from "mediasoup/types";

import { MediaWorkerPool } from "../../src/modules/media/media-worker-pool";

function createWorkerMock(pid: number): { worker: Worker; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();

  return {
    worker: {
    pid,
    close,
    on: vi.fn(),
    } as unknown as Worker,
    close,
  };
}

describe("MediaWorkerPool", () => {
  it("starts the configured number of workers and rotates between them", async () => {
    const { worker: firstWorker } = createWorkerMock(101);
    const { worker: secondWorker } = createWorkerMock(102);
    const workerFactory = vi
      .fn()
      .mockResolvedValueOnce(firstWorker)
      .mockResolvedValueOnce(secondWorker);
    const pool = new MediaWorkerPool({ workerCount: 2 }, workerFactory);

    await pool.start();

    expect(workerFactory).toHaveBeenCalledTimes(2);
    expect(pool.getStatus()).toEqual({ status: "ready", workerCount: 2 });
    expect(pool.getNextWorker()).toBe(firstWorker);
    expect(pool.getNextWorker()).toBe(secondWorker);
    expect(pool.getNextWorker()).toBe(firstWorker);
  });

  it("closes every worker and prevents selection after shutdown", async () => {
    const { worker, close } = createWorkerMock(101);
    const pool = new MediaWorkerPool(
      { workerCount: 1 },
      vi.fn().mockResolvedValue(worker),
    );

    await pool.start();
    pool.close();

    expect(close).toHaveBeenCalledOnce();
    expect(pool.getStatus()).toEqual({ status: "not_started", workerCount: 0 });
    expect(() => pool.getNextWorker()).toThrow("has not been started");
  });
});
