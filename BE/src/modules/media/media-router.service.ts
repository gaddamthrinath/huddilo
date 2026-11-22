import type { Router } from "mediasoup/types";

import type { MediaWorkerPool } from "./media-worker-pool";

/** Shares one live router per meeting within this backend process. */
export class MediaRouterService {
  private readonly routersByMeetingCode = new Map<string, Router>();
  private readonly pendingRouters = new Map<string, Promise<Router>>();

  public constructor(private readonly mediaWorkerPool: MediaWorkerPool) {}

  public getRouter(meetingCode: string): Router | undefined {
    return this.routersByMeetingCode.get(meetingCode);
  }

  public async getOrCreateRouter(meetingCode: string): Promise<Router> {
    const existing = this.getRouter(meetingCode) ?? this.pendingRouters.get(meetingCode);
    if (existing) return existing;

    const creation = this.createRouter(meetingCode);
    this.pendingRouters.set(meetingCode, creation);
    try {
      return await creation;
    } finally {
      this.pendingRouters.delete(meetingCode);
    }
  }

  private async createRouter(meetingCode: string): Promise<Router> {
    const worker = this.mediaWorkerPool.getNextWorker();
    const router = await worker.createRouter({
      mediaCodecs: [
        { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
        { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
      ],
    });
    this.routersByMeetingCode.set(meetingCode, router);
    router.observer.once("close", () => this.routersByMeetingCode.delete(meetingCode));
    return router;
  }
}
