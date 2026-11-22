import type { MediaWorkerPool } from "./media-worker-pool";

/**
 * Will manage one mediasoup Router for each active Huddilo meeting.
 *
 * Router creation, lookup, and shutdown are intentionally added in later
 * small steps. This first version only establishes its worker-pool dependency.
 */
export class MediaRouterService {
  public constructor(private readonly mediaWorkerPool: MediaWorkerPool) {}
}
