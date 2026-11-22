import type {
  MediaWorkerPoolStatus,
  MediaWorkerPoolStatusProvider,
} from "../media/media-worker-pool";

export type HealthStatus = {
  status: "ok";
  service: "huddilo-backend";
  timestamp: string;
  uptimeSeconds: number;
  media?: MediaWorkerPoolStatus;
};

export class HealthService {
  public constructor(
    private readonly mediaWorkerPool?: MediaWorkerPoolStatusProvider,
  ) {}

  public getStatus(): HealthStatus {
    return {
      status: "ok",
      service: "huddilo-backend",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      ...(this.mediaWorkerPool
        ? { media: this.mediaWorkerPool.getStatus() }
        : {}),
    };
  }
}
