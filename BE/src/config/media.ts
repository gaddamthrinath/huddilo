import type { WorkerSettings } from "mediasoup/types";

import { env } from "./env";

export const mediaConfig = {
  workerCount: env.MEDIA_WORKER_COUNT,
  workerSettings: {
    logLevel: env.MEDIA_LOG_LEVEL,
  } satisfies WorkerSettings,
};
