import { createServer } from "node:http";

import { createApp } from "./app";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { env } from "./config/env";
import { mediaConfig } from "./config/media";
import { turnConfig } from "./config/turn";
import { MediaAccessService } from "./modules/media/media-access.service";
import { MediaRouterService } from "./modules/media/media-router.service";
import { MediaProducerService } from "./modules/media/media-producer.service";
import { MediaTransportService } from "./modules/media/media-transport.service";
import { MediaWorkerPool } from "./modules/media/media-worker-pool";
import { TurnCredentialService } from "./modules/media/turn-credential.service";
import { MeetingRepository } from "./modules/meetings/meeting.repository";
import { MeetingService } from "./modules/meetings/meeting.service";
import { RealtimeGateway } from "./modules/realtime/realtime-gateway";
import { MeetingRoomService } from "./modules/rooms/meeting-room.service";

async function startServer(): Promise<void> {
  await connectDatabase();

  const mediaWorkerPool = new MediaWorkerPool(mediaConfig);
  await mediaWorkerPool.start();
  const mediaRouters = new MediaRouterService(mediaWorkerPool);
  const mediaTransports = new MediaTransportService(mediaRouters, mediaConfig.webRtcTransport);
  const mediaProducers = new MediaProducerService(mediaRouters, mediaTransports);

  const httpServer = createServer(createApp({ mediaWorkerPool }));
  const rooms = new MeetingRoomService();
  const meetings = new MeetingService(new MeetingRepository());
  const mediaAccess = new MediaAccessService(
    rooms,
    new TurnCredentialService(turnConfig.sharedSecret),
    turnConfig.urls,
  );
  const realtimeGateway = new RealtimeGateway(
    httpServer,
    env.FRONTEND_ORIGIN,
    rooms,
    meetings,
    mediaAccess,
    mediaTransports,
    mediaProducers,
  );

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
    void realtimeGateway.close().finally(() => {
      httpServer.close(() => {
        mediaWorkerPool.close();
        void disconnectDatabase().finally(() => process.exit(0));
      });
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void startServer().catch((error: unknown) => {
  console.error("Unable to start the server", error);
  process.exit(1);
});
