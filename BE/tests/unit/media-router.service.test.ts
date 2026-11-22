import { expect, it } from "vitest";
import { MediaRouterService } from "../../src/modules/media/media-router.service";
import { MediaWorkerPool } from "../../src/modules/media/media-worker-pool";

it("shares concurrent router creation per meeting and recovers after closure or failure", async () => {
  const pool = new MediaWorkerPool({ workerCount: 1 });
  const service = new MediaRouterService(pool);
  try {
    await expect(service.getOrCreateRouter("room-a")).rejects.toThrow();
    await pool.start();
    const [alice, bob, separate] = await Promise.all([
      service.getOrCreateRouter("room-a"),
      service.getOrCreateRouter("room-a"),
      service.getOrCreateRouter("room-b"),
    ]);
    expect(alice).toBe(bob);
    expect(await service.getOrCreateRouter("room-a")).toBe(alice);
    expect(separate.id).not.toBe(alice.id);
    expect(alice.rtpCapabilities.codecs?.map(codec => codec.mimeType.toLowerCase()))
      .toEqual(expect.arrayContaining(["audio/opus", "video/vp8"]));
    alice.close();
    expect(service.getRouter("room-a")).toBeUndefined();
    expect((await service.getOrCreateRouter("room-a")).id).not.toBe(alice.id);
  } finally {
    pool.close();
  }
});
