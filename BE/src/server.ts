import { createServer } from "node:http";

import { createApp } from "./app";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { env } from "./config/env";
import { mediaConfig } from "./config/media";
import { MediaWorkerPool } from "./modules/media/media-worker-pool";

async function startServer(): Promise<void> {
  await connectDatabase();

  const mediaWorkerPool = new MediaWorkerPool(mediaConfig);
  await mediaWorkerPool.start();

  const httpServer = createServer(createApp({ mediaWorkerPool }));

  httpServer.listen(env.PORT, () => {
    console.info(`Huddilo API listening on http://localhost:${env.PORT}`);
  });

  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.info(`${signal} received; shutting down`);
    httpServer.close(() => {
      mediaWorkerPool.close();
      void disconnectDatabase().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void startServer().catch((error: unknown) => {
  console.error("Unable to start the server", error);
  process.exit(1);
});
