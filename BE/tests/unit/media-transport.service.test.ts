import { describe, expect, it } from "vitest";

import { MediaRouterService } from "../../src/modules/media/media-router.service";
import { MediaTransportService } from "../../src/modules/media/media-transport.service";
import { MediaWorkerPool } from "../../src/modules/media/media-worker-pool";

it("creates one reusable send transport and a separate receive transport per participant", async () => {
  const pool = new MediaWorkerPool({ workerCount: 1 });
  await pool.start();
  const transports = new MediaTransportService(new MediaRouterService(pool), {
    listenInfos: [{ protocol: "udp", ip: "127.0.0.1" }],
    preferUdp: true,
  });

  try {
    const send = await transports.getOrCreateTransport("room-a", "participant-a", "send");
    const sameSend = await transports.getOrCreateTransport("room-a", "participant-a", "send");
    const receive = await transports.getOrCreateTransport("room-a", "participant-a", "receive");

    expect(send.id).toBe(sameSend.id);
    expect(receive.id).not.toBe(send.id);
    expect(send.iceCandidates).not.toHaveLength(0);
    expect(send.dtlsParameters.fingerprints).not.toHaveLength(0);

    const restarted = await transports.getTransport("room-a", "participant-a", "send").restartIce();
    expect(restarted.usernameFragment).not.toBe(send.iceParameters.usernameFragment);
    expect((await transports.getOrCreateTransport("room-a", "participant-a", "send")).id).toBe(send.id);

    transports.closeParticipantTransports("room-a", "participant-a");
    const replacement = await transports.getOrCreateTransport("room-a", "participant-a", "send");
    expect(replacement.id).not.toBe(send.id);
  } finally {
    pool.close();
  }
});

describe("MediaTransportService.parseDtlsParameters", () => {
  it("accepts a browser DTLS fingerprint and rejects malformed input", () => {
    expect(
      MediaTransportService.parseDtlsParameters({
        fingerprints: [{ algorithm: "sha-256", value: "browser-fingerprint" }],
      }),
    ).toEqual({ fingerprints: [{ algorithm: "sha-256", value: "browser-fingerprint" }] });

    expect(() => MediaTransportService.parseDtlsParameters({ fingerprints: [] })).toThrow(
      "Valid DTLS parameters are required",
    );
  });
});
