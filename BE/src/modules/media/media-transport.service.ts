import type { DtlsParameters, IceCandidate, IceParameters, WebRtcTransport } from "mediasoup/types";

import { AppError } from "../../common/errors/app-error";
import type { WebRtcTransportConfig } from "../../config/media";
import { observeMediaTransport } from "./media-diagnostics";
import type { MediaRouterService } from "./media-router.service";

export type TransportDirection = "send" | "receive";

export type WebRtcTransportParameters = {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: readonly IceCandidate[];
  dtlsParameters: DtlsParameters;
};

type ParticipantTransport = {
  meetingCode: string;
  participantId: string;
  direction: TransportDirection;
  transport: WebRtcTransport;
};

/** Owns each participant's mediasoup WebRTC send and receive transports. */
export class MediaTransportService {
  private readonly transportsByParticipant = new Map<string, ParticipantTransport>();

  public constructor(
    private readonly routers: MediaRouterService,
    private readonly options: WebRtcTransportConfig,
  ) {}

  /** Creates or returns one direction-specific transport for an admitted participant. */
  public async getOrCreateTransport(
    meetingCode: string,
    participantId: string,
    direction: TransportDirection,
  ): Promise<WebRtcTransportParameters> {
    const transportKey = this.transportKey(meetingCode, participantId, direction);
    const existing = this.transportsByParticipant.get(transportKey);
    if (existing) {
      return this.toParameters(existing.transport);
    }

    const router = await this.routers.getOrCreateRouter(meetingCode);
    const transport = await router.createWebRtcTransport({
      listenInfos: this.options.listenInfos,
      preferUdp: this.options.preferUdp,
      appData: { meetingCode, participantId, direction },
    });

    const participantTransport = { meetingCode, participantId, direction, transport };
    this.transportsByParticipant.set(transportKey, participantTransport);
    transport.observer.once("close", () => this.transportsByParticipant.delete(transportKey));
    observeMediaTransport(transport, participantId, direction);

    return this.toParameters(transport);
  }

  /** Closes both media tunnels when a browser disconnects. */
  public closeParticipantTransports(meetingCode: string, participantId: string): void {
    for (const direction of ["send", "receive"] as const) {
      const transportKey = this.transportKey(meetingCode, participantId, direction);
      const participantTransport = this.transportsByParticipant.get(transportKey);
      if (participantTransport) {
        participantTransport.transport.close();
      }
    }
  }

  /** Applies the browser's DTLS identity to an existing send or receive transport. */
  public async connectTransport(
    meetingCode: string,
    participantId: string,
    direction: TransportDirection,
    dtlsParameters: DtlsParameters,
  ): Promise<void> {
    const participantTransport = this.transportsByParticipant.get(
      this.transportKey(meetingCode, participantId, direction),
    );
    if (!participantTransport) {
      throw new AppError(
        "Create the media transport before connecting it",
        404,
        "TRANSPORT_NOT_FOUND",
      );
    }

    if (participantTransport.transport.dtlsState === "connected") {
      return;
    }

    await participantTransport.transport.connect({ dtlsParameters });
  }

  /** Returns a connected transport so only completed DTLS handshakes can carry media. */
  public getConnectedTransport(
    meetingCode: string,
    participantId: string,
    direction: TransportDirection,
  ): WebRtcTransport {
    const participantTransport = this.transportsByParticipant.get(
      this.transportKey(meetingCode, participantId, direction),
    );
    if (!participantTransport) {
      throw new AppError("Create the media transport before using it", 404, "TRANSPORT_NOT_FOUND");
    }
    if (participantTransport.transport.dtlsState !== "connected") {
      throw new AppError("Connect the media transport before using it", 409, "TRANSPORT_NOT_CONNECTED");
    }

    return participantTransport.transport;
  }

  /** Returns an existing transport when mediasoup may safely configure it before DTLS completes. */
  public getTransport(
    meetingCode: string,
    participantId: string,
    direction: TransportDirection,
  ): WebRtcTransport {
    const participantTransport = this.transportsByParticipant.get(
      this.transportKey(meetingCode, participantId, direction),
    );
    if (!participantTransport) {
      throw new AppError("Create the media transport before using it", 404, "TRANSPORT_NOT_FOUND");
    }

    return participantTransport.transport;
  }

  /** Rejects event payload values outside the two supported browser directions. */
  public static parseDirection(direction: unknown): TransportDirection {
    if (direction === "send" || direction === "receive") {
      return direction;
    }

    throw new AppError("Transport direction must be send or receive", 400, "INVALID_TRANSPORT_DIRECTION");
  }

  /** Validates the DTLS fields received over Socket.IO before mediasoup uses them. */
  public static parseDtlsParameters(input: unknown): DtlsParameters {
    if (!input || typeof input !== "object") {
      throw new AppError("Valid DTLS parameters are required", 400, "INVALID_DTLS_PARAMETERS");
    }

    const candidate = input as { fingerprints?: unknown; role?: unknown };
    const validAlgorithms = new Set(["sha-1", "sha-224", "sha-256", "sha-384", "sha-512"]);
    const validRoles = new Set(["auto", "client", "server"]);
    if (
      !Array.isArray(candidate.fingerprints) ||
      candidate.fingerprints.length === 0 ||
      candidate.fingerprints.some(
        (fingerprint) =>
          !fingerprint ||
          typeof fingerprint !== "object" ||
          typeof (fingerprint as { algorithm?: unknown }).algorithm !== "string" ||
          !validAlgorithms.has((fingerprint as { algorithm: string }).algorithm) ||
          typeof (fingerprint as { value?: unknown }).value !== "string" ||
          !(fingerprint as { value: string }).value.trim(),
      ) ||
      (candidate.role !== undefined &&
        (typeof candidate.role !== "string" || !validRoles.has(candidate.role)))
    ) {
      throw new AppError("Valid DTLS parameters are required", 400, "INVALID_DTLS_PARAMETERS");
    }

    return candidate as DtlsParameters;
  }

  private toParameters(transport: WebRtcTransport): WebRtcTransportParameters {
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  private transportKey(meetingCode: string, participantId: string, direction: TransportDirection): string {
    return `${meetingCode}:${participantId}:${direction}`;
  }
}
