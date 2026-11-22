import { Router } from "express";

import { HealthController } from "../modules/health/health.controller";
import { HealthRoutes } from "../modules/health/health.routes";
import { HealthService } from "../modules/health/health.service";
import { MeetingController } from "../modules/meetings/meeting.controller";
import { MeetingRepository } from "../modules/meetings/meeting.repository";
import { MeetingRoutes } from "../modules/meetings/meeting.routes";
import { MeetingService } from "../modules/meetings/meeting.service";
import type { MediaWorkerPoolStatusProvider } from "../modules/media/media-worker-pool";

type ApiRouterDependencies = {
  mediaWorkerPool?: MediaWorkerPoolStatusProvider;
};

export function createApiRouter({ mediaWorkerPool }: ApiRouterDependencies = {}) {
  const apiRouter = Router();

  const healthService = new HealthService(mediaWorkerPool);
  const healthController = new HealthController(healthService);
  const healthRoutes = new HealthRoutes(healthController);

  const meetingRepository = new MeetingRepository();
  const meetingService = new MeetingService(meetingRepository);
  const meetingController = new MeetingController(meetingService);
  const meetingRoutes = new MeetingRoutes(meetingController);

  apiRouter.use("/health", healthRoutes.router);
  apiRouter.use("/meetings", meetingRoutes.router);

  return apiRouter;
}
