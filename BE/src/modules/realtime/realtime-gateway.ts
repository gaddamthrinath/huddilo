import type { Server as HttpServer } from "node:http";

import { Server, type Socket } from "socket.io";

import { AppError } from "../../common/errors/app-error";
import { getCookieValue, getHostCookieName } from "../meetings/host-session";
import type { IceServerConfiguration, MediaAccessService } from "../media/media-access.service";
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

type MediaAccessResponse =
  | { success: true; iceServer: IceServerConfiguration }
  | { success: false; error: { code: string; message: string } };

type CreateTransportResponse =
  | { success: true; transport: WebRtcTransportParameters }
  | { success: false; error: { code: string; message: string } };

type ConnectTransportResponse =
  | { success: true }
  | { success: false; error: { code: string; message: string } };

type CapabilitiesResponse =
  | { success: true; rtpCapabilities: unknown }
  | { success: false; error: { code: string; message: string } };

type ProduceResponse =
  | { success: true; producer: ProducedTrack }
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
      socket.on("room:join", async (payload: JoinRoomPayload, acknowledge: (response: JoinRoomResponse) => void) => {
        try {
          acknowledge({ success: true, participant: await this.joinRoom(socket, payload) });
        } catch (error: unknown) {
          acknowledge(this.errorResponse(error));
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

      socket.on("disconnect", () => this.closeParticipantTransports(socket));
    });
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
    const participant = hostToken
      ? await this.joinAsHost(meetingCode, socket.id, displayName, hostToken)
      : await this.joinAsGuest(meetingCode, socket.id, displayName);

    socket.data.meetingCode = meetingCode;
    socket.data.participantId = socket.id;
    socket.data.role = participant.role;
    await socket.join(this.meetingChannel(meetingCode));

    if (participant.role === "host") {
      await socket.join(this.hostChannel(meetingCode));
    } else {
      this.io.to(this.hostChannel(meetingCode)).emit("waiting-room:guest-requested", participant);
    }

    return participant;
  }

  private async joinAsHost(
    meetingCode: string,
    participantId: string,
    displayName: string,
    hostToken: string,
  ): Promise<RoomParticipant> {
    await this.meetings.verifyHostAccess(meetingCode, hostToken);
    return this.rooms.openHostRoom(meetingCode, { id: participantId, displayName });
  }

  private async joinAsGuest(
    meetingCode: string,
    participantId: string,
    displayName: string,
  ): Promise<RoomParticipant> {
    await this.meetings.getMeeting(meetingCode);
    return this.rooms.requestGuestJoin(meetingCode, { id: participantId, displayName });
  }

  private admitGuest(socket: HuddiloSocket, guestParticipantId: string): RoomParticipant {
    const meetingCode = socket.data.meetingCode;
    const hostParticipantId = socket.data.participantId;
    if (!meetingCode || !hostParticipantId || socket.data.role !== "host") {
      throw new AppError("Only a meeting host can admit guests", 403, "HOST_REQUIRED");
    }

    const participant = this.rooms.admitGuest(meetingCode, hostParticipantId, guestParticipantId);
    this.io.to(guestParticipantId).emit("room:admitted", { meetingCode });

    return participant;
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

  private closeParticipantTransports(socket: HuddiloSocket): void {
    const { meetingCode, participantId } = socket.data;
    if (meetingCode && participantId) {
      const removedProducers = this.mediaProducers.closeParticipantMedia(meetingCode, participantId);
      this.mediaTransports.closeParticipantTransports(meetingCode, participantId);
      for (const producer of removedProducers) {
        socket.to(this.meetingChannel(meetingCode)).emit("media:producer-closed", producer);
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
