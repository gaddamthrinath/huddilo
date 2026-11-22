"use client";

import { Device, type types } from "mediasoup-client";
import type { Socket } from "socket.io-client";

import { emitWithAck } from "@/lib/realtime/meeting-socket";
import { isMeetingDiagnosticsEnabled, mediaTraceId, recordMeetingDiagnostic, summarizeMediaStats } from "./meeting-diagnostics";

type RealtimeFailure = {
  success: false;
  error: { code: string; message: string };
};

type IceServerResponse =
  | {
      success: true;
      iceServer: { urls: readonly string[]; username: string; credential: string };
    }
  | RealtimeFailure;

type RouterCapabilitiesResponse =
  | { success: true; rtpCapabilities: types.RtpCapabilities }
  | RealtimeFailure;

type TransportParameters = Pick<types.TransportOptions, "id" | "iceParameters" | "iceCandidates" | "dtlsParameters">;
type TransportResponse = { success: true; transport: TransportParameters } | RealtimeFailure;

type ProducerResponse =
  | { success: true; producer: { id: string } }
  | RealtimeFailure;

type PublishedProducer = {
  id: string;
  participantId: string;
  kind: "audio" | "video";
};

type ProducerListResponse =
  | { success: true; producers: PublishedProducer[] }
  | RealtimeFailure;

type ConsumerResponse =
  | {
      success: true;
      consumer: {
        id: string;
        producerId: string;
        kind: "audio" | "video";
        rtpParameters: types.RtpParameters;
      };
    }
  | RealtimeFailure;

type SuccessResponse = { success: true } | RealtimeFailure;
type RestartIceResponse = { success: true; iceParameters: types.IceParameters } | RealtimeFailure;

export type MediaRecoveryState = "stable" | "recovering" | "failed";
type MediaDirection = "send" | "receive";
const MEDIA_DISCONNECT_GRACE_MS = 2_000;
const MEDIA_RECOVERY_TIMEOUT_MS = 10_000;
const MEDIA_STATS_INTERVAL_MS = 3_000;

export type RemoteMediaTrack = {
  participantId: string;
  producerId: string;
  kind: "audio" | "video";
  stream: MediaStream;
};

export type MeetingMediaEvents = {
  onRemoteTrack?: (track: RemoteMediaTrack) => void;
  onRemoteTrackRemoved?: (producerId: string) => void;
  onRecoveryState?: (state: MediaRecoveryState) => void;
};

/** Restrict a diagnostic connection to direct TCP candidates from the SFU. */
function mediaTransportOptions(
  parameters: TransportParameters,
  iceServers: RTCIceServer[],
  directTcp: boolean,
): types.TransportOptions {
  if (!directTcp) return { ...parameters, iceServers };

  const iceCandidates = parameters.iceCandidates.filter((candidate) => candidate.protocol === "tcp");
  if (!iceCandidates.length) {
    throw new Error("The meeting server did not offer a TCP media route. Remove mediaTransport=tcp to use the standard route.");
  }
  // Leave out STUN and TURN servers so the test can only select direct ICE-TCP.
  return { ...parameters, iceCandidates, iceServers: [] };
}

/**
 * Owns one browser's mediasoup transports, local Producers, and remote Consumers.
 * The React UI supplies `onRemoteTrack` later to render incoming media tiles.
 */
export class MeetingMediaClient {
  private closed = false;
  private device: Device | undefined;
  private sendTransport: types.Transport | undefined;
  private receiveTransport: types.Transport | undefined;
  private audioProducer: types.Producer | undefined;
  private videoProducer: types.Producer | undefined;
  private readonly remoteConsumers = new Map<string, types.Consumer>();
  private readonly pendingProducerIds = new Set<string>();
  private readonly recoveryTimers = new Map<types.Transport, ReturnType<typeof setTimeout>>();
  private readonly recoveringTransports = new Map<types.Transport, "starting" | "recovering" | "failed">();
  private statsTimer: ReturnType<typeof setInterval> | undefined;
  private samplingStats = false;

  public constructor(
    private readonly socket: Socket,
    private readonly events: MeetingMediaEvents = {},
  ) {}

  /** Loads router codecs and creates separate secure upload/download transports once. */
  public async prepare(): Promise<void> {
    if (this.closed) return;
    if (this.sendTransport && this.receiveTransport) {
      return;
    }

    // The Device learns which codecs the meeting router supports before it can
    // produce or consume any WebRTC track.
    const [capabilitiesResponse, iceServerResponse] = await Promise.all([
      emitWithAck<RouterCapabilitiesResponse>(this.socket, "media:get-router-capabilities"),
      emitWithAck<IceServerResponse>(this.socket, "media:request-access"),
    ]);
    const routerRtpCapabilities = this.requireSuccess(
      capabilitiesResponse,
      "Could not load meeting media capabilities.",
    ).rtpCapabilities;
    const iceServer = this.requireSuccess(
      iceServerResponse,
      "Could not prepare the meeting network connection.",
    ).iceServer;

    const device = await Device.factory();
    await device.load({ routerRtpCapabilities });
    if (this.closed) return;

    // The server creates two transports: send for this person's tracks and
    // receive for tracks forwarded from other participants.
    const [sendTransportResponse, receiveTransportResponse] = await Promise.all([
      emitWithAck<TransportResponse>(this.socket, "media:create-transport", "send"),
      emitWithAck<TransportResponse>(this.socket, "media:create-transport", "receive"),
    ]);
    if (this.closed) return;
    const sendTransportParameters = this.requireSuccess(
      sendTransportResponse,
      "Could not create the upload transport.",
    ).transport;
    const receiveTransportParameters = this.requireSuccess(
      receiveTransportResponse,
      "Could not create the download transport.",
    ).transport;

    const diagnosticsEnabled = isMeetingDiagnosticsEnabled();
    const directTcp = diagnosticsEnabled && new URLSearchParams(window.location.search).get("mediaTransport") === "tcp";
    const iceServers = [{ urls: [...iceServer.urls], username: iceServer.username, credential: iceServer.credential }];
    const sendOptions = mediaTransportOptions(sendTransportParameters, iceServers, directTcp);
    const receiveOptions = mediaTransportOptions(receiveTransportParameters, iceServers, directTcp);
    const sendTransport = device.createSendTransport(sendOptions);
    const receiveTransport = device.createRecvTransport(receiveOptions);
    this.registerTransportEvents(sendTransport, "send");
    this.registerTransportEvents(receiveTransport, "receive");

    this.device = device;
    this.sendTransport = sendTransport;
    this.receiveTransport = receiveTransport;
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    if (diagnosticsEnabled && this.statsTimer === undefined) {
      recordMeetingDiagnostic("media-transports-created", {
        visibility: document.visibilityState,
        route: directTcp ? "direct-tcp" : "default",
        client: mediaTraceId(this.socket.id),
        send: mediaTraceId(sendTransport.id),
        receive: mediaTraceId(receiveTransport.id),
      });
      this.statsTimer = setInterval(() => {
        if (document.visibilityState === "visible") void this.sampleMediaStats();
      }, MEDIA_STATS_INTERVAL_MS);
    }

    // New tracks are announced in real time. The list request catches tracks
    // that existed before this browser joined the meeting.
    this.socket.on("media:new-producer", this.handleNewProducer);
    this.socket.on("media:producer-closed", this.handleProducerClosed);
    const producerListResponse = await emitWithAck<ProducerListResponse>(
      this.socket,
      "media:list-producers",
    );
    const producers = this.requireSuccess(
      producerListResponse,
      "Could not load other participants' media.",
    ).producers;
    await Promise.all(producers.map((producer) => this.consumeProducer(producer)));
  }

  /** Publishes enabled microphone and camera tracks from an existing local MediaStream. */
  public async publish(stream: MediaStream): Promise<void> {
    await this.prepare();
    if (this.closed) return;

    const sendTransport = this.sendTransport;
    if (!this.device || !sendTransport) {
      throw new Error("The meeting send transport is not ready.");
    }

    const audioTrack = stream.getAudioTracks().find((track) => track.enabled);
    if (audioTrack && !this.audioProducer && this.device.canProduce("audio")) {
      // The preview hook owns the tracks, so reconnecting can reuse them.
      this.audioProducer = await sendTransport.produce({ track: audioTrack, stopTracks: false });
      if (!this.closed) recordMeetingDiagnostic("media-track-published", {
        kind: "audio", producer: mediaTraceId(this.audioProducer.id), transport: mediaTraceId(sendTransport.id),
      });
    }
    if (this.closed) return;

    const videoTrack = stream.getVideoTracks().find((track) => track.enabled);
    if (videoTrack && !this.videoProducer && this.device.canProduce("video")) {
      this.videoProducer = await sendTransport.produce({
        track: videoTrack,
        stopTracks: false,
        // Order simulcast encodings from lowest to highest resolution.
        encodings: [
          { scaleResolutionDownBy: 4, maxBitrate: 150_000, maxFramerate: 15, scalabilityMode: "S1T3" },
          { scaleResolutionDownBy: 2, maxBitrate: 500_000, maxFramerate: 24, scalabilityMode: "S1T3" },
          { scaleResolutionDownBy: 1, maxBitrate: 1_200_000, maxFramerate: 24, scalabilityMode: "S1T3" },
        ],
      });
      if (!this.closed) recordMeetingDiagnostic("media-track-published", {
        kind: "video", producer: mediaTraceId(this.videoProducer.id), transport: mediaTraceId(sendTransport.id),
      });
    }
  }

  /** Closes local and remote media resources when leaving a meeting. */
  public close(): void {
    if (!this.closed) recordMeetingDiagnostic("media-transports-closing");
    this.closed = true;
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    clearInterval(this.statsTimer);
    for (const timer of this.recoveryTimers.values()) clearTimeout(timer);
    this.recoveryTimers.clear();
    this.recoveringTransports.clear();
    this.audioProducer?.close();
    this.videoProducer?.close();
    this.sendTransport?.close();
    this.receiveTransport?.close();
    for (const consumer of this.remoteConsumers.values()) {
      consumer.close();
    }
    this.socket.off("media:new-producer", this.handleNewProducer);
    this.socket.off("media:producer-closed", this.handleProducerClosed);
    this.audioProducer = undefined;
    this.videoProducer = undefined;
    this.sendTransport = undefined;
    this.receiveTransport = undefined;
    this.remoteConsumers.clear();
    this.pendingProducerIds.clear();
    this.device = undefined;
  }

  private readonly handleNewProducer = (producer: PublishedProducer): void => {
    void this.consumeProducer(producer).catch((error: unknown) => {
      if (!this.closed) console.error("Could not receive a meeting track", error);
    });
  };

  private readonly handleVisibilityChange = (): void => {
    recordMeetingDiagnostic("page-visibility", { state: document.visibilityState });
    if (isMeetingDiagnosticsEnabled()) void this.sampleMediaStats();
    if (document.visibilityState !== "visible") return;
    if (this.sendTransport) this.scheduleIceRecovery(this.sendTransport, "send");
    if (this.receiveTransport) this.scheduleIceRecovery(this.receiveTransport, "receive");
  };

  /** Sample browser-side counters without sending reports to the backend. */
  private async sampleMediaStats(): Promise<void> {
    if (this.closed || this.samplingStats) return;
    this.samplingStats = true;

    const transports = [
      ["send", this.sendTransport],
      ["receive", this.receiveTransport],
    ] as const;

    try {
      await Promise.all(transports.map(async ([direction, transport]) => {
        if (!transport || transport.closed || transport.connectionState === "new") return;
        try {
          const stats = await transport.getStats();
          if (this.closed) return;
          recordMeetingDiagnostic("media-stats", {
            client: mediaTraceId(this.socket.id),
            transport: mediaTraceId(transport.id),
            direction,
            state: transport.connectionState,
            visibility: document.visibilityState,
            ...summarizeMediaStats(stats, direction),
          });
        } catch {
          if (!this.closed) recordMeetingDiagnostic("media-stats-unavailable", { direction, transport: mediaTraceId(transport.id) });
        }
      }));
    } finally {
      this.samplingStats = false;
    }
  }

  /** Give brief drops time to recover, and wait for a backgrounded phone to return. */
  private scheduleIceRecovery(transport: types.Transport, direction: MediaDirection): void {
    if (this.closed || !this.socket.connected || document.visibilityState !== "visible") return;
    const state = transport.connectionState;
    if (state !== "disconnected" && state !== "failed") return;
    if (this.recoveryTimers.has(transport) || this.recoveringTransports.has(transport)) return;

    const timer = setTimeout(() => {
      this.recoveryTimers.delete(transport);
      if (document.visibilityState !== "visible" || !this.socket.connected || this.closed) return;
      if (transport.connectionState === "disconnected" || transport.connectionState === "failed") {
        void this.restartIce(transport, direction);
      }
    }, state === "failed" ? 0 : MEDIA_DISCONNECT_GRACE_MS);
    this.recoveryTimers.set(transport, timer);
  }

  /** Restart ICE without discarding a transport that recovered while signaling was pending. */
  private async restartIce(transport: types.Transport, direction: MediaDirection): Promise<void> {
    this.recoveringTransports.set(transport, "starting");
    this.reportRecoveryState();
    try {
      const response = await emitWithAck<RestartIceResponse>(this.socket, "media:restart-ice", direction);
      if (this.closed || transport.closed || !this.socket.connected) return;
      const { iceParameters } = this.requireSuccess(response, "Could not restart the media connection.");
      await transport.restartIce({ iceParameters });
      if (this.closed || !this.recoveringTransports.has(transport)) return;
      this.recoveringTransports.set(transport, "recovering");
      if (transport.connectionState === "connected") {
        this.finishRecovery(transport);
        return;
      }
      const timer = setTimeout(() => {
        if (transport.connectionState === "connected") {
          this.finishRecovery(transport);
          return;
        }
        this.recoveryTimers.delete(transport);
        this.recoveringTransports.set(transport, "failed");
        this.reportRecoveryState();
      }, MEDIA_RECOVERY_TIMEOUT_MS);
      this.recoveryTimers.set(transport, timer);
    } catch (error) {
      if (this.closed || transport.closed || !this.socket.connected || !this.recoveringTransports.has(transport)) return;
      // The original ICE path can recover while the restart acknowledgment is in flight.
      if (transport.connectionState === "connected") {
        recordMeetingDiagnostic("media-recovery-preserved", { direction });
        this.finishRecovery(transport);
        if (isMeetingDiagnosticsEnabled()) void this.sampleMediaStats();
        return;
      }
      console.error("Huddilo media recovery failed", error);
      this.recoveringTransports.set(transport, "failed");
      this.reportRecoveryState();
    }
  }

  private finishRecovery(transport: types.Transport): void {
    clearTimeout(this.recoveryTimers.get(transport));
    this.recoveryTimers.delete(transport);
    if (this.recoveringTransports.delete(transport)) this.reportRecoveryState();
  }

  private reportRecoveryState(): void {
    const states = [...this.recoveringTransports.values()];
    const state = states.includes("failed") ? "failed" : states.length ? "recovering" : "stable";
    recordMeetingDiagnostic("media-recovery-state", { state });
    this.events.onRecoveryState?.(state);
  }

  /** Removes a tile when its owner disconnects or stops publishing a track. */
  private readonly handleProducerClosed = (producer: PublishedProducer): void => {
    const consumer = this.remoteConsumers.get(producer.id);
    recordMeetingDiagnostic("media-track-removed", {
      producer: mediaTraceId(producer.id), consumer: mediaTraceId(consumer?.id), kind: producer.kind,
    });
    consumer?.close();
    this.remoteConsumers.delete(producer.id);
    this.events.onRemoteTrackRemoved?.(producer.id);
  };

  /** Connects each browser transport with DTLS; only a send transport can publish. */
  private registerTransportEvents(
    transport: types.Transport,
    direction: MediaDirection,
  ): void {
    transport.on("connectionstatechange", (state) => {
      if (this.closed) return;
      recordMeetingDiagnostic("media-connection-state", {
        client: mediaTraceId(this.socket.id),
        transport: mediaTraceId(transport.id),
        direction,
        state,
        socketConnected: this.socket.connected,
      });
      if (state === "connected") {
        if (this.recoveringTransports.get(transport) !== "starting") this.finishRecovery(transport);
      } else {
        this.scheduleIceRecovery(transport, direction);
      }
    });
    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      void emitWithAck<SuccessResponse>(
        this.socket,
        "media:connect-transport",
        direction,
        dtlsParameters,
      )
        .then((response) => {
          this.requireSuccess(response, "Could not secure the media transport.");
          callback();
        })
        .catch((error: unknown) => errback(this.toError(error)));
    });

    if (direction !== "send") {
      return;
    }

    transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
      void emitWithAck<ProducerResponse>(this.socket, "media:produce", kind, rtpParameters)
        .then((response) => {
          const producer = this.requireSuccess(response, "Could not publish media.").producer;
          callback({ id: producer.id });
        })
        .catch((error: unknown) => errback(this.toError(error)));
    });
  }

  /** Creates one local Consumer for another participant's published audio or video track. */
  private async consumeProducer(producer: PublishedProducer): Promise<void> {
    if (
      !this.device ||
      !this.receiveTransport ||
      this.remoteConsumers.has(producer.id) ||
      this.pendingProducerIds.has(producer.id)
    ) {
      return;
    }

    this.pendingProducerIds.add(producer.id);
    try {
      const response = await emitWithAck<ConsumerResponse>(
        this.socket,
        "media:consume",
        producer.id,
        this.device.recvRtpCapabilities,
      );
      if (this.closed) return;
      const consumerParameters = this.requireSuccess(
        response,
        "Could not receive another participant's media.",
      ).consumer;
      const consumer = await this.receiveTransport.consume(consumerParameters);
      if (this.closed) {
        consumer.close();
        return;
      }
      this.remoteConsumers.set(producer.id, consumer);

      // Consumers begin paused on the server. Resume only after the browser
      // owns the local Consumer, preventing loss of the first video keyframe.
      const resumeResponse = await emitWithAck<SuccessResponse>(
        this.socket,
        "media:resume-consumer",
        consumer.id,
      );
      if (this.closed) return;
      this.requireSuccess(resumeResponse, "Could not start remote media.");
      recordMeetingDiagnostic("media-track-receiving", {
        transport: mediaTraceId(this.receiveTransport?.id),
        consumer: mediaTraceId(consumer.id), producer: mediaTraceId(producer.id), kind: consumer.kind,
      });

      const stream = new MediaStream([consumer.track]);
      this.events.onRemoteTrack?.({
        participantId: producer.participantId,
        producerId: producer.id,
        kind: producer.kind,
        stream,
      });
    } finally {
      this.pendingProducerIds.delete(producer.id);
    }
  }

  private requireSuccess<Data extends object>(
    response: ({ success: true } & Data) | RealtimeFailure,
    fallbackMessage: string,
  ): { success: true } & Data {
    if (!response.success) {
      throw new Error(response.error.message || fallbackMessage);
    }

    return response;
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error("A media connection error occurred.");
  }
}
