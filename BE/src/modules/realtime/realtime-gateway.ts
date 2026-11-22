import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";

import type { IceParameters } from "mediasoup/types";
import { Server, type Socket } from "socket.io";

import { AppError } from "../../common/errors/app-error";
import { getCookieValue, getHostCookieName } from "../meetings/host-session";
import { getGuestCookieName, GuestSessionService } from "../meetings/guest-session.service";
import type { IceServerConfiguration, MediaAccessService } from "../media/media-access.service";
import { logMediaDiagnostic, mediaDiagnosticsEnabled, mediaTraceId } from "../media/media-diagnostics";
import {
  MediaProducerService,
  type ConsumerParameters,
  type ProducedTrack,
} from "../media/media-producer.service";
import {
  MediaTransportService,
  type TransportDirection,
  type WebRtcTransportParameters,
} from "../media/media-transport.service";
import type { MeetingLookup } from "../meetings/meeting.repository";
import type { MeetingRoomService, ParticipantRole, RoomParticipant } from "../rooms/meeting-room.service";

type MeetingAccessService = {
  getMeeting(meetingCode: string): Promise<MeetingLookup>;
  verifyHostAccess(meetingCode: string, hostToken: string): Promise<MeetingLookup>;
};

type JoinRoomPayload = {
  meetingCode: string;
  displayName: string;
};

type JoinRoomResponse =
  | { success: true; participant: RoomParticipant }
  | { success: false; error: { code: string; message: string } };

type ParticipantListResponse =
  | { success: true; participants: RoomParticipant[] }
  | { success: false; error: { code: string; message: string } };

type MediaAccessResponse =
  | { success: true; iceServer: IceServerConfiguration }
  | { success: false; error: { code: string; message: string } };

type CreateTransportResponse =
  | { success: true; transport: WebRtcTransportParameters }
  | { success: false; error: { code: string; message: string } };

type ConnectTransportResponse =
  | { success: true }
  | { success: false; error: { code: string; message: string } };

type RestartIceResponse =
  | { success: true; iceParameters: IceParameters }
  | { success: false; error: { code: string; message: string } };

type CapabilitiesResponse =
  | { success: true; rtpCapabilities: unknown }
  | { success: false; error: { code: string; message: string } };

type ProduceResponse =
  | { success: true; producer: ProducedTrack }
  | { success: false; error: { code: string; message: string } };

type ProducerListResponse =
  | { success: true; producers: ProducedTrack[] }
  | { success: false; error: { code: string; message: string } };

type ConsumerResponse =
  | { success: true; consumer: ConsumerParameters }
  | { success: false; error: { code: string; message: string } };

type SuccessResponse =
  | { success: true }
  | { success: false; error: { code: string; message: string } };

type RealtimeSocketData = {
  meetingCode?: string;
  participantId?: string;
  role?: ParticipantRole;
  guestSessionId?: string;
  joining?: boolean;
};

type HuddiloSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  RealtimeSocketData
>;

/** Handles the real-time waiting-room messages for connected browsers. */
export class RealtimeGateway {
  private readonly io: Server<Record<string, never>, Record<string, never>, Record<string, never>, RealtimeSocketData>;

  public constructor(
    httpServer: HttpServer,
    frontendOrigin: string,
    private readonly rooms: MeetingRoomService,
    private readonly meetings: MeetingAccessService,
    private readonly mediaAccess: MediaAccessService,
    private readonly mediaTransports: MediaTransportService,
    private readonly mediaProducers: MediaProducerService,
    private readonly guestSessions = new GuestSessionService(),
  ) {
    this.io = new Server(httpServer, {
      cors: { origin: frontendOrigin, credentials: true },
    });
    this.registerConnectionHandler();
  }

  /** Stops Socket.IO when the backend begins its graceful shutdown. */
  public async close(): Promise<void> {
    await this.io.close();
  }

  private registerConnectionHandler(): void {
    this.io.on("connection", (socket) => {
      console.info(`Realtime client ${socket.id} connected`);
      if (mediaDiagnosticsEnabled()) this.observeSignaling(socket);
      socket.on("room:join", async (payload: JoinRoomPayload, acknowledge: (response: JoinRoomResponse) => void) => {
        if (typeof acknowledge !== "function") return;
        if (socket.data.joining) {
          acknowledge(this.errorResponse(new AppError("A join is already in progress", 409, "JOIN_IN_PROGRESS")));
          return;
        }
        socket.data.joining = true;
        try {
          acknowledge({ success: true, participant: await this.joinRoom(socket, payload) });
        } catch (error: unknown) {
          acknowledge(this.errorResponse(error));
        } finally {
          socket.data.joining = false;
        }
      });

      socket.on("room:admit", (guestParticipantId: string, acknowledge: (response: JoinRoomResponse) => void) => {
        try {
          const participant = this.admitGuest(socket, guestParticipantId);
          acknowledge({ success: true, participant });
        } catch (error: unknown) {
          acknowledge(this.errorResponse(error));
        }
      });

      // A browser uses this after admission to learn about people who joined
      // before it did, including camera-off participants with no media Producer.
      socket.on("room:list-participants", (acknowledge: (response: ParticipantListResponse) => void) => {
        try {
          acknowledge({ success: true, participants: this.listAdmittedParticipants(socket) });
        } catch (error: unknown) {
          acknowledge(this.errorResponse(error));
        }
      });

      socket.on("media:request-access", (acknowledge: (response: MediaAccessResponse) => void) => {
        try {
          acknowledge({ success: true, iceServer: this.getMediaAccess(socket) });
        } catch (error: unknown) {
          acknowledge(this.errorResponse(error));
        }
      });

      socket.on(
        "media:create-transport",
        async (direction: unknown, acknowledge: (response: CreateTransportResponse) => void) => {
          try {
            acknowledge({ success: true, transport: await this.createMediaTransport(socket, direction) });
          } catch (error: unknown) {
            acknowledge(this.errorResponse(error));
          }
        },
      );

      socket.on("media:get-router-capabilities", async (acknowledge: (response: CapabilitiesResponse) => void) => {
        try {
          acknowledge({ success: true, rtpCapabilities: await this.getRouterCapabilities(socket) });
        } catch (error: unknown) {
          acknowledge(this.errorResponse(error));
        }
      });

      socket.on(
        "media:produce",
        async (
          kind: unknown,
          rtpParameters: unknown,
          acknowledge: (response: ProduceResponse) => void,
        ) => {
          try {
            const producer = await this.produceMedia(socket, kind, rtpParameters);
            acknowledge({ success: true, producer });
            socket.to(this.meetingChannel(socket.data.meetingCode!)).emit("media:new-producer", producer);
          } catch (error: unknown) {
            acknowledge(this.errorResponse(error));
          }
        },
      );

      // A newly admitted browser calls this once to catch up with tracks that
      // were published before its Socket.IO connection joined the meeting.
      socket.on("media:list-producers", (acknowledge: (response: ProducerListResponse) => void) => {
        try {
          acknowledge({ success: true, producers: this.listMediaProducers(socket) });
        } catch (error: unknown) {
          acknowledge(this.errorResponse(error));
        }
      });

      socket.on(
        "media:consume",
        async (
          producerId: unknown,
          rtpCapabilities: unknown,
          acknowledge: (response: ConsumerResponse) => void,
        ) => {
          try {
            acknowledge({ success: true, consumer: await this.consumeMedia(socket, producerId, rtpCapabilities) });
          } catch (error: unknown) {
            acknowledge(this.errorResponse(error));
          }
        },
      );

      socket.on("media:resume-consumer", async (consumerId: unknown, acknowledge: (response: SuccessResponse) => void) => {
        try {
          await this.resumeConsumer(socket, consumerId);
          acknowledge({ success: true });
        } catch (error: unknown) {
          acknowledge(this.errorResponse(error));
        }
      });

      socket.on(
        "media:connect-transport",
        async (
          direction: unknown,
          dtlsParameters: unknown,
          acknowledge: (response: ConnectTransportResponse) => void,
        ) => {
          try {
            await this.connectMediaTransport(socket, direction, dtlsParameters);
            acknowledge({ success: true });
          } catch (error: unknown) {
            acknowledge(this.errorResponse(error));
          }
        },
      );

      socket.on("media:restart-ice", (direction: unknown, acknowledge: (response: RestartIceResponse) => void) =>
        this.handleIceRestart(socket, direction, acknowledge));

      socket.on("disconnect", (reason) => {
        logMediaDiagnostic("signaling.disconnected", { client: mediaTraceId(socket.id), reason });
        this.handleParticipantDisconnect(socket);
      });
    });
  }

  /** Times room and media requests without inspecting their credentials or RTP parameters. */
  private observeSignaling(socket: HuddiloSocket): void {
    const client = mediaTraceId(socket.id);
    logMediaDiagnostic("signaling.connected", { client });
    socket.use((packet, next) => {
      const operation = packet[0];
      const value: unknown = packet[1];
      if (operation === "media:restart-ice" || socket.listenerCount(operation) === 0 ||
          (!operation.startsWith("room:") && !operation.startsWith("media:"))) {
        next();
        return;
      }

      const requestId = randomUUID();
      const startedAt = performance.now();
      const direction = value === "send" || value === "receive" ? value : undefined;
      const kind = operation === "media:produce" && (value === "audio" || value === "video") ? value : undefined;
      const labels = { client, operation, requestId, direction, kind };
      const acknowledge: unknown = packet.at(-1);
      logMediaDiagnostic("signaling.received", { ...labels, expectsAck: typeof acknowledge === "function" });
      if (typeof acknowledge === "function") {
        const sendAcknowledgment = acknowledge as (response: SuccessResponse) => void;
        packet[packet.length - 1] = (response: SuccessResponse) => {
          sendAcknowledgment(response);
          logMediaDiagnostic("signaling.replied", {
            ...labels, elapsedMs: Math.round(performance.now() - startedAt),
            outcome: response.success ? "success" : response.error.code,
          });
        };
      }
      next();
    });
  }

  /** Renews ICE credentials and records where the backend spent time before replying. */
  private async handleIceRestart(
    socket: HuddiloSocket,
    directionInput: unknown,
    acknowledge: (response: RestartIceResponse) => void,
  ): Promise<void> {
    if (typeof acknowledge !== "function") return;

    const requestId = mediaDiagnosticsEnabled() ? randomUUID() : undefined;
    const startedAt = performance.now();
    const directionLabel = directionInput === "send" || directionInput === "receive" ? directionInput : "invalid";
    const client = mediaTraceId(socket.id);
    if (requestId) {
      console.info("[media:restart-ice] received", JSON.stringify({
        at: new Date().toISOString(), requestId, client, direction: directionLabel,
      }));
    }

    let response: RestartIceResponse;
    let transportId: string | undefined;
    let workerStartedAt: number | undefined;
    try {
      const { meetingCode, participantId } = socket.data;
      if (!meetingCode || !participantId || !this.rooms.isParticipantAdmitted(meetingCode, participantId)) {
        throw new AppError("Join the meeting before restarting media", 403, "PARTICIPANT_NOT_ADMITTED");
      }
      const direction = MediaTransportService.parseDirection(directionInput);
      const transport = this.mediaTransports.getTransport(meetingCode, participantId, direction);
      if (requestId) transportId = mediaTraceId(transport.id);
      workerStartedAt = performance.now();
      response = { success: true, iceParameters: await transport.restartIce() };
    } catch (error: unknown) {
      response = this.errorResponse(error);
    }

    const completedAt = performance.now();
    acknowledge(response);
    if (requestId) {
      // The acknowledgment is handed to Socket.IO here. The client trace records delivery.
      console.info("[media:restart-ice] replied", JSON.stringify({
        at: new Date().toISOString(),
        requestId,
        client,
        transport: transportId,
        direction: directionLabel,
        elapsedMs: Math.round(completedAt - startedAt),
        workerMs: workerStartedAt === undefined ? null : Math.round(completedAt - workerStartedAt),
        outcome: response.success ? "success" : response.error.code,
        socketConnected: socket.connected,
      }));
    }
  }

  private async joinRoom(
    socket: HuddiloSocket,
    payload: JoinRoomPayload,
  ): Promise<RoomParticipant> {
    if (socket.data.meetingCode) {
      throw new AppError("This connection has already joined a meeting", 409, "ALREADY_JOINED");
    }

    const meetingCode = payload.meetingCode.trim().toLowerCase();
    const displayName = payload.displayName.trim();
    if (!displayName) {
      throw new AppError("Enter your display name to join", 400, "DISPLAY_NAME_REQUIRED");
    }

    const hostToken = getCookieValue(socket.handshake.headers, getHostCookieName(meetingCode));
    const guestSessionId = hostToken ? undefined
      : getCookieValue(socket.handshake.headers, getGuestCookieName(meetingCode));
    if (hostToken) {
      await this.meetings.verifyHostAccess(meetingCode, hostToken);
    } else {
      await this.meetings.getMeeting(meetingCode);
    }
    if (!socket.connected) {
      throw new AppError("The connection closed while joining", 409, "CONNECTION_CLOSED");
    }

    const input = { id: socket.id, displayName };
    let participant: RoomParticipant;
    if (hostToken) {
      participant = this.rooms.openHostRoom(meetingCode, input);
    } else {
      const approved = this.guestSessions.claim(meetingCode, guestSessionId, socket.id);
      try {
        participant = approved
          ? this.rooms.restoreApprovedGuest(meetingCode, input)
          : this.rooms.requestGuestJoin(meetingCode, input);
      } catch (error) {
        this.guestSessions.release(meetingCode, guestSessionId, socket.id);
        throw error;
      }
    }

    socket.data.meetingCode = meetingCode;
    socket.data.participantId = socket.id;
    socket.data.role = participant.role;
    socket.data.guestSessionId = guestSessionId;
    await socket.join(this.meetingChannel(meetingCode));

    if (participant.role === "host") {
      await socket.join(this.hostChannel(meetingCode));
      for (const waitingGuest of this.rooms.getParticipants(meetingCode)) {
        if (waitingGuest.access === "waiting") {
          this.io.to(socket.id).emit("waiting-room:guest-requested", waitingGuest);
        }
      }
      socket.to(this.meetingChannel(meetingCode)).emit("room:participant-admitted", participant);
    } else if (participant.access === "admitted") {
      socket.to(this.meetingChannel(meetingCode)).emit("room:participant-admitted", participant);
    } else {
      this.io.to(this.hostChannel(meetingCode)).emit("waiting-room:guest-requested", participant);
    }

    return participant;
  }

  private admitGuest(socket: HuddiloSocket, guestParticipantId: string): RoomParticipant {
    const meetingCode = socket.data.meetingCode;
    const hostParticipantId = socket.data.participantId;
    if (!meetingCode || !hostParticipantId || socket.data.role !== "host") {
      throw new AppError("Only a meeting host can admit guests", 403, "HOST_REQUIRED");
    }

    const participant = this.rooms.admitGuest(meetingCode, hostParticipantId, guestParticipantId);
    const guest = this.io.sockets.sockets.get(guestParticipantId);
    this.guestSessions.approve(meetingCode, guest?.data.guestSessionId, guestParticipantId, participant.displayName);
    this.io.to(guestParticipantId).emit("room:admitted", { meetingCode });
    this.io.to(this.meetingChannel(meetingCode)).emit("room:participant-admitted", participant);

    return participant;
  }

  private listAdmittedParticipants(socket: HuddiloSocket): RoomParticipant[] {
    const { meetingCode, participantId } = socket.data;
    if (!meetingCode || !participantId) {
      throw new AppError("Join a meeting before listing participants", 403, "ROOM_JOIN_REQUIRED");
    }
    if (!this.rooms.isParticipantAdmitted(meetingCode, participantId)) {
      throw new AppError("Wait for the host to admit you", 403, "PARTICIPANT_NOT_ADMITTED");
    }

    return this.rooms.getAdmittedParticipants(meetingCode);
  }

  private getMediaAccess(socket: HuddiloSocket): IceServerConfiguration {
    const meetingCode = socket.data.meetingCode;
    const participantId = socket.data.participantId;
    if (!meetingCode || !participantId) {
      throw new AppError("Join a meeting before requesting media access", 403, "ROOM_JOIN_REQUIRED");
    }

    return this.mediaAccess.getIceServerConfiguration(meetingCode, participantId);
  }

  private async createMediaTransport(
    socket: HuddiloSocket,
    directionInput: unknown,
  ): Promise<WebRtcTransportParameters> {
    const meetingCode = socket.data.meetingCode;
    const participantId = socket.data.participantId;
    if (!meetingCode || !participantId) {
      throw new AppError("Join a meeting before creating a media transport", 403, "ROOM_JOIN_REQUIRED");
    }

    this.mediaAccess.getIceServerConfiguration(meetingCode, participantId);
    const direction: TransportDirection = MediaTransportService.parseDirection(directionInput);
    return this.mediaTransports.getOrCreateTransport(meetingCode, participantId, direction);
  }

  private handleParticipantDisconnect(socket: HuddiloSocket): void {
    const { meetingCode, participantId } = socket.data;
    if (meetingCode && participantId) {
      this.guestSessions.release(meetingCode, socket.data.guestSessionId, participantId);
      const removedProducers = this.mediaProducers.closeParticipantMedia(meetingCode, participantId);
      this.mediaTransports.closeParticipantTransports(meetingCode, participantId);
      for (const producer of removedProducers) {
        socket.to(this.meetingChannel(meetingCode)).emit("media:producer-closed", producer);
      }
      const participant = this.rooms.removeParticipant(meetingCode, participantId);
      if (participant?.access === "admitted") {
        socket.to(this.meetingChannel(meetingCode)).emit("room:participant-left", participantId);
      } else if (participant?.access === "waiting") {
        socket.to(this.hostChannel(meetingCode)).emit("waiting-room:guest-left", participantId);
      }
    }
  }

  private async getRouterCapabilities(socket: HuddiloSocket): Promise<unknown> {
    const { meetingCode, participantId } = socket.data;
    if (!meetingCode || !participantId) {
      throw new AppError("Join a meeting before preparing media", 403, "ROOM_JOIN_REQUIRED");
    }
    this.mediaAccess.getIceServerConfiguration(meetingCode, participantId);
    return this.mediaProducers.getRouterRtpCapabilities(meetingCode);
  }

  private async produceMedia(
    socket: HuddiloSocket,
    kindInput: unknown,
    rtpParametersInput: unknown,
  ): Promise<ProducedTrack> {
    const { meetingCode, participantId } = socket.data;
    if (!meetingCode || !participantId) {
      throw new AppError("Join a meeting before publishing media", 403, "ROOM_JOIN_REQUIRED");
    }
    this.mediaAccess.getIceServerConfiguration(meetingCode, participantId);
    return this.mediaProducers.produce(
      meetingCode,
      participantId,
      MediaProducerService.parseKind(kindInput),
      MediaProducerService.parseRtpObject(rtpParametersInput),
    );
  }

  /** Returns only other participants' published tracks after waiting-room admission. */
  private listMediaProducers(socket: HuddiloSocket): ProducedTrack[] {
    const { meetingCode, participantId } = socket.data;
    if (!meetingCode || !participantId) {
      throw new AppError("Join a meeting before receiving media", 403, "ROOM_JOIN_REQUIRED");
    }
    this.mediaAccess.getIceServerConfiguration(meetingCode, participantId);
    return this.mediaProducers.listAvailableProducers(meetingCode, participantId);
  }

  private async consumeMedia(
    socket: HuddiloSocket,
    producerIdInput: unknown,
    rtpCapabilitiesInput: unknown,
  ): Promise<ConsumerParameters> {
    const { meetingCode, participantId } = socket.data;
    if (!meetingCode || !participantId) {
      throw new AppError("Join a meeting before receiving media", 403, "ROOM_JOIN_REQUIRED");
    }
    if (typeof producerIdInput !== "string" || !producerIdInput) {
      throw new AppError("A producer ID is required", 400, "PRODUCER_ID_REQUIRED");
    }
    this.mediaAccess.getIceServerConfiguration(meetingCode, participantId);
    return this.mediaProducers.createConsumer(
      meetingCode,
      participantId,
      producerIdInput,
      MediaProducerService.parseRtpCapabilities(rtpCapabilitiesInput),
    );
  }

  private async resumeConsumer(socket: HuddiloSocket, consumerIdInput: unknown): Promise<void> {
    const { meetingCode, participantId } = socket.data;
    if (!meetingCode || !participantId) {
      throw new AppError("Join a meeting before receiving media", 403, "ROOM_JOIN_REQUIRED");
    }
    if (typeof consumerIdInput !== "string" || !consumerIdInput) {
      throw new AppError("A consumer ID is required", 400, "CONSUMER_ID_REQUIRED");
    }
    this.mediaAccess.getIceServerConfiguration(meetingCode, participantId);
    await this.mediaProducers.resumeConsumer(meetingCode, participantId, consumerIdInput);
  }

  private async connectMediaTransport(
    socket: HuddiloSocket,
    directionInput: unknown,
    dtlsParametersInput: unknown,
  ): Promise<void> {
    const meetingCode = socket.data.meetingCode;
    const participantId = socket.data.participantId;
    if (!meetingCode || !participantId) {
      throw new AppError("Join a meeting before connecting media", 403, "ROOM_JOIN_REQUIRED");
    }

    this.mediaAccess.getIceServerConfiguration(meetingCode, participantId);
    const direction = MediaTransportService.parseDirection(directionInput);
    const dtlsParameters = MediaTransportService.parseDtlsParameters(dtlsParametersInput);
    await this.mediaTransports.connectTransport(meetingCode, participantId, direction, dtlsParameters);
  }

  private meetingChannel(meetingCode: string): string {
    return `meeting:${meetingCode}`;
  }

  private hostChannel(meetingCode: string): string {
    return `meeting-host:${meetingCode}`;
  }

  private errorResponse(error: unknown): { success: false; error: { code: string; message: string } } {
    if (error instanceof AppError) {
      return { success: false, error: { code: error.code, message: error.message } };
    }

    console.error("Unhandled realtime meeting error", error);

    return {
      success: false,
      error: { code: "REALTIME_ERROR", message: "We could not process the meeting request" },
    };
  }
}
