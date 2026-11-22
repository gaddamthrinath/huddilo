import { createWorker } from "mediasoup";
import type { Worker, WorkerSettings } from "mediasoup/types";

export type MediaWorkerFactory = (
  settings?: WorkerSettings,
) => Promise<Worker>;

export type MediaWorkerPoolStatus = {
  status: "ready" | "not_started";
  workerCount: number;
};

export interface MediaWorkerPoolStatusProvider {
  getStatus(): MediaWorkerPoolStatus;
}

type MediaWorkerPoolOptions = {
  workerCount: number;
  workerSettings?: WorkerSettings;
};

/**
 * Owns native mediasoup worker processes for one application instance.
 *
 * A worker runs outside Node.js as a C++ subprocess. Meeting routers will later
 * be assigned to workers in round-robin order so media work can use multiple
 * CPU cores without blocking the Node.js event loop.
 */
export class MediaWorkerPool implements MediaWorkerPoolStatusProvider {
  private readonly workers: Worker[] = [];
  private nextWorkerIndex = 0;

  public constructor(
    private readonly options: MediaWorkerPoolOptions,
    private readonly workerFactory: MediaWorkerFactory = createWorker,
  ) {}

  /** Starts the configured number of native mediasoup worker processes. */
  public async start(): Promise<void> {
    if (this.workers.length > 0) {
      return;
    }

    try {
      await Promise.all(
        Array.from({ length: this.options.workerCount }, () =>
          this.createAndTrackWorker(),
        ),
      );
      console.info(`Mediasoup worker pool ready with ${this.workers.length} worker(s)`);
    } catch (error: unknown) {
      this.close();
      throw error;
    }
  }

  /** Returns the next healthy worker using round-robin selection. */
  public getNextWorker(): Worker {
    if (this.workers.length === 0) {
      throw new Error("Media worker pool has not been started");
    }

    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;

    if (!worker) {
      throw new Error("Media worker pool could not select a worker");
    }

    return worker;
  }

  /** Reports whether the SFU workers required by this process are ready. */
  public getStatus(): MediaWorkerPoolStatus {
    return {
      status: this.workers.length > 0 ? "ready" : "not_started",
      workerCount: this.workers.length,
    };
  }

  /** Stops every worker during an application shutdown or failed startup. */
  public close(): void {
    for (const worker of this.workers) {
      worker.close();
    }

    this.workers.length = 0;
    this.nextWorkerIndex = 0;
  }

  /** Creates one worker and records unexpected worker termination in server logs. */
  private async createAndTrackWorker(): Promise<void> {
    const worker = await this.workerFactory(this.options.workerSettings);

    worker.on("died", (error) => {
      console.error(`mediasoup worker ${worker.pid} died`, error);
    });

    this.workers.push(worker);
    console.info(`Mediasoup worker ${worker.pid} started`);
  }
}
