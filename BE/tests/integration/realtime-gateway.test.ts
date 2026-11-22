import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { io as createClient, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaAccessService } from "../../src/modules/media/media-access.service";
import { getGuestCookieName, GuestSessionService } from "../../src/modules/meetings/guest-session.service";
import type { MediaProducerService } from "../../src/modules/media/media-producer.service";
import type { MediaTransportService } from "../../src/modules/media/media-transport.service";
import { TurnCredentialService } from "../../src/modules/media/turn-credential.service";
import { RealtimeGateway } from "../../src/modules/realtime/realtime-gateway";
import { MeetingRoomService } from "../../src/modules/rooms/meeting-room.service";

type JoinResponse = {
  success: boolean;
  participant?: { id: string; role: string; access: string };
  error?: { code: string; message: string };
};

type MediaAccessResponse = {
  success: boolean;
  iceServer?: { urls: readonly string[]; username: string; credential: string };
  error?: { code: string; message: string };
};

type CreateTransportResponse = {
  success: boolean;
  transport?: { id: string };
  error?: { code: string; message: string };
};

type ConnectTransportResponse = {
  success: boolean;
  error?: { code: string; message: string };
};

function connect(url: string, cookie?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createClient(url, {
      transports: ["websocket"],
      ...(cookie ? { extraHeaders: { Cookie: cookie } } : {}),
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function emitWithAck<Response>(
  socket: Socket,
  event: string,
  ...args: unknown[]
): Promise<Response> {
  return new Promise<Response>((resolve) => socket.emit(event, ...args, resolve));
}

describe("RealtimeGateway", () => {
  const sockets: Socket[] = [];
  const httpServers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    for (const httpServer of httpServers.splice(0)) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  it("sends a guest request to the host and delivers host admission", async () => {
    const httpServer = createServer();
    httpServers.push(httpServer);
    const rooms = new MeetingRoomService();
    const meetingAccess = {
      getMeeting: vi.fn().mockResolvedValue({}),
      verifyHostAccess: vi.fn().mockResolvedValue({}),
    };
    const mediaAccess = new MediaAccessService(
      rooms,
      new TurnCredentialService("test-shared-secret-that-is-long-enough"),
      ["stun:localhost:3478", "turn:localhost:3478?transport=udp"],
    );
    const mediaTransports: Pick<
      MediaTransportService,
      "getOrCreateTransport" | "connectTransport" | "closeParticipantTransports" | "getTransport"
    > = {
      getOrCreateTransport: vi.fn().mockResolvedValue({
        id: "transport-id",
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: { fingerprints: [] },
      }),
      connectTransport: vi.fn().mockResolvedValue(undefined),
      closeParticipantTransports: vi.fn(),
      getTransport: vi.fn().mockReturnValue({
        id: "transport-id",
        restartIce: vi.fn().mockResolvedValue({ usernameFragment: "fresh", password: "test-password" }),
      }),
    };
    const mediaProducers: Pick<
      MediaProducerService,
      | "getRouterRtpCapabilities"
      | "listAvailableProducers"
      | "produce"
      | "createConsumer"
      | "resumeConsumer"
      | "closeParticipantMedia"
    > = {
      getRouterRtpCapabilities: vi.fn().mockResolvedValue({ codecs: [] }),
      listAvailableProducers: vi.fn().mockReturnValue([]),
      produce: vi.fn().mockResolvedValue({ id: "producer-id", participantId: "guest", kind: "audio" }),
      createConsumer: vi.fn().mockResolvedValue({
        id: "consumer-id",
        producerId: "producer-id",
        kind: "audio",
        rtpParameters: {},
      }),
      resumeConsumer: vi.fn().mockResolvedValue(undefined),
      closeParticipantMedia: vi.fn().mockReturnValue([]),
    };
    const guestSessions = new GuestSessionService();
    const meetingCode = "abc-defg-hij";
    const guestSessionId = guestSessions.ensure(meetingCode);
    const guestCookie = `${getGuestCookieName(meetingCode)}=${guestSessionId}`;
    const gateway = new RealtimeGateway(
      httpServer,
      "http://localhost:3000",
      rooms,
      meetingAccess,
      mediaAccess,
      mediaTransports as MediaTransportService,
      mediaProducers as MediaProducerService,
      guestSessions,
    );
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const { port } = httpServer.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}`;

    const host = await connect(url, "huddilo_host_abc_defg_hij=host-token");
    const guest = await connect(url, guestCookie);
    sockets.push(host, guest);

    const hostJoin = await emitWithAck<JoinResponse>(host, "room:join", {
      meetingCode: "abc-defg-hij",
      displayName: "Asha",
    });
    expect(hostJoin.participant).toMatchObject({ role: "host", access: "admitted" });

    const guestRequested = new Promise<{ id: string }>((resolve) => {
      host.once("waiting-room:guest-requested", resolve);
    });
    const guestJoin = await emitWithAck<JoinResponse>(guest, "room:join", {
      meetingCode: "abc-defg-hij",
      displayName: "Jordan",
    });
    const waitingGuest = await guestRequested;
    expect(guestJoin.participant).toMatchObject({ role: "guest", access: "waiting" });

    const deniedMediaAccess = await emitWithAck<MediaAccessResponse>(guest, "media:request-access");
    expect(deniedMediaAccess).toMatchObject({
      success: false,
      error: { code: "PARTICIPANT_NOT_ADMITTED" },
    });
    expect(await emitWithAck(guest, "media:restart-ice", "receive")).toMatchObject({
      success: false,
      error: { code: "PARTICIPANT_NOT_ADMITTED" },
    });
    expect(mediaTransports.getTransport).not.toHaveBeenCalled();

    const admitted = new Promise<{ meetingCode: string }>((resolve) => {
      guest.once("room:admitted", resolve);
    });
    const admission = await emitWithAck<JoinResponse>(host, "room:admit", waitingGuest.id);
    expect(admission.participant).toMatchObject({ access: "admitted" });
    await expect(admitted).resolves.toEqual({ meetingCode: "abc-defg-hij" });

    const grantedMediaAccess = await emitWithAck<MediaAccessResponse>(guest, "media:request-access");
    expect(grantedMediaAccess).toMatchObject({
      success: true,
      iceServer: {
        urls: ["stun:localhost:3478", "turn:localhost:3478?transport=udp"],
      },
    });
    expect(grantedMediaAccess.iceServer?.username).toContain(`:${guest.id}`);

    const transport = await emitWithAck<CreateTransportResponse>(guest, "media:create-transport", "send");
    expect(transport).toMatchObject({ success: true, transport: { id: "transport-id" } });
    expect(await emitWithAck(guest, "media:restart-ice", "send")).toMatchObject({
      success: true,
      iceParameters: { usernameFragment: "fresh" },
    });
    expect(mediaTransports.getTransport).toHaveBeenCalledWith(meetingCode, guest.id, "send");

    const invalidTransport = await emitWithAck<CreateTransportResponse>(guest, "media:create-transport", "invalid");
    expect(invalidTransport).toMatchObject({
      success: false,
      error: { code: "INVALID_TRANSPORT_DIRECTION" },
    });

    const connectedTransport = await emitWithAck<ConnectTransportResponse>(
      guest,
      "media:connect-transport",
      "send",
      { fingerprints: [{ algorithm: "sha-256", value: "browser-fingerprint" }] },
    );
    expect(connectedTransport).toEqual({ success: true });
    expect(mediaTransports.connectTransport).toHaveBeenCalledWith(
      "abc-defg-hij",
      guest.id,
      "send",
      { fingerprints: [{ algorithm: "sha-256", value: "browser-fingerprint" }] },
    );

    const invalidDtls = await emitWithAck<ConnectTransportResponse>(
      guest,
      "media:connect-transport",
      "send",
      { fingerprints: [] },
    );
    expect(invalidDtls).toMatchObject({
      success: false,
      error: { code: "INVALID_DTLS_PARAMETERS" },
    });

    const producerAnnouncement = new Promise<{ id: string }>((resolve) => {
      host.once("media:new-producer", resolve);
    });
    const produced = await emitWithAck<{ success: boolean; producer?: { id: string } }>(
      guest,
      "media:produce",
      "audio",
      { codecs: [] },
    );
    expect(produced).toMatchObject({ success: true, producer: { id: "producer-id" } });
    await expect(producerAnnouncement).resolves.toEqual({
      id: "producer-id",
      participantId: "guest",
      kind: "audio",
    });

    const consumed = await emitWithAck<{ success: boolean; consumer?: { id: string } }>(
      host,
      "media:consume",
      "producer-id",
      { codecs: [] },
    );
    expect(consumed).toMatchObject({ success: true, consumer: { id: "consumer-id" } });

    const resumed = await emitWithAck<ConnectTransportResponse>(
      host,
      "media:resume-consumer",
      "consumer-id",
    );
    expect(resumed).toEqual({ success: true });

    const guestId = guest.id;
    const departure = new Promise<string>((resolve) => {
      host.once("room:participant-left", resolve);
    });
    guest.disconnect();
    await expect(departure).resolves.toBe(guestId);
    const roster = await emitWithAck<{ success: boolean; participants: { id: string }[] }>(
      host, "room:list-participants",
    );
    expect(roster.success).toBe(true);
    expect(roster.participants.map((participant) => participant.id)).toEqual([host.id]);

    const returningGuest = await connect(url, guestCookie);
    const otherBrowser = await connect(url);
    sockets.push(returningGuest, otherBrowser);
    expect(await emitWithAck<JoinResponse>(returningGuest, "room:join", {
      meetingCode, displayName: "Jordan",
    })).toMatchObject({ success: true, participant: { access: "admitted", role: "guest" } });
    expect(await emitWithAck<JoinResponse>(otherBrowser, "room:join", {
      meetingCode, displayName: "Jordan",
    })).toMatchObject({ success: true, participant: { access: "waiting", role: "guest" } });

    await gateway.close();
  });
});
