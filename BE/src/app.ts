import cors from "cors";
import express from "express";
import helmet from "helmet";

import { errorHandler } from "./common/middleware/error-handler";
import { notFound } from "./common/middleware/not-found";
import { requestId } from "./common/middleware/request-id";
import { env } from "./config/env";
import { setupApiDocs } from "./docs/swagger";
import type { MediaWorkerPoolStatusProvider } from "./modules/media/media-worker-pool";
import { createApiRouter } from "./routes";

type AppDependencies = {
  mediaWorkerPool?: MediaWorkerPoolStatusProvider;
};

export function createApp({ mediaWorkerPool }: AppDependencies = {}): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(requestId);

  setupApiDocs(app);
  app.use("/api/v1", createApiRouter({ mediaWorkerPool }));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
