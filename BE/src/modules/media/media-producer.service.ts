import type { Consumer, MediaKind, RtpCapabilities, RtpParameters } from "mediasoup/types";

import { AppError } from "../../common/errors/app-error";
import type { MediaRouterService } from "./media-router.service";
import type { MediaTransportService } from "./media-transport.service";

export type ProducedTrack = {
  id: string;
  participantId: string;
  kind: MediaKind;
};

export type ConsumerParameters = {
  id: string;
  producerId: string;
  kind: MediaKind;
  rtpParameters: RtpParameters;
};

type TrackedProducer = ProducedTrack & { meetingCode: string };
type TrackedConsumer = { meetingCode: string; participantId: string; consumer: Consumer };

/** Creates SFU Producers and Consumers after each browser's transports are connected. */
export class MediaProducerService {
  private readonly producers = new Map<string, TrackedProducer>();
  private readonly consumers = new Map<string, TrackedConsumer>();

  public constructor(
    private readonly routers: MediaRouterService,
    private readonly transports: MediaTransportService,
  ) {}

  /** Registers a microphone or camera track arriving from a browser send transport. */
  public async produce(
    meetingCode: string,
    participantId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters,
  ): Promise<ProducedTrack> {
    // mediasoup creates the Producer before the browser finishes its first
    // WebRTC negotiation. That negotiation triggers the DTLS connect callback
    // immediately afterward, so requiring a connected state here rejects the
    // normal mediasoup-client produce sequence.
    const transport = this.transports.getTransport(meetingCode, participantId, "send");
    const producer = await transport.produce({ kind, rtpParameters, appData: { meetingCode, participantId } });
    const trackedProducer = { id: producer.id, meetingCode, participantId, kind };
    this.producers.set(producer.id, trackedProducer);
    producer.observer.once("close", () => this.producers.delete(producer.id));
    return { id: producer.id, participantId, kind };
  }

  /** Returns the meeting router capabilities required to initialize mediasoup-client Device. */
  public async getRouterRtpCapabilities(meetingCode: string): Promise<RtpCapabilities> {
    return (await this.routers.getOrCreateRouter(meetingCode)).rtpCapabilities;
  }

  /** Lists tracks that a participant can request from other people in the meeting. */
  public listAvailableProducers(meetingCode: string, participantId: string): ProducedTrack[] {
    return [...this.producers.values()].filter(
      (producer) => producer.meetingCode === meetingCode && producer.participantId !== participantId,
    );
  }

  /** Creates a paused outgoing copy of a Producer for one participant's receive transport. */
  public async createConsumer(
    meetingCode: string,
    participantId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities,
  ): Promise<ConsumerParameters> {
    const producer = this.producers.get(producerId);
    if (!producer || producer.meetingCode !== meetingCode) {
      throw new AppError("The requested media track is unavailable", 404, "PRODUCER_NOT_FOUND");
    }

    const router = this.routers.getRouter(meetingCode);
    if (!router || !router.canConsume({ producerId, rtpCapabilities })) {
      throw new AppError("This browser cannot receive the requested media", 400, "CANNOT_CONSUME");
    }

    // A Consumer is created before the browser calls receiveTransport.consume(),
    // which is the action that starts its DTLS handshake. Producers differ: a
    // browser must already have connected its send transport before publishing.
    const transport = this.transports.getTransport(meetingCode, participantId, "receive");
    const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
    this.consumers.set(consumer.id, { meetingCode, participantId, consumer });
    consumer.observer.once("close", () => this.consumers.delete(consumer.id));

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  /** Starts an already-created Consumer after the browser has attached its local track. */
  public async resumeConsumer(meetingCode: string, participantId: string, consumerId: string): Promise<void> {
    const trackedConsumer = this.consumers.get(consumerId);
    if (
      !trackedConsumer ||
      trackedConsumer.meetingCode !== meetingCode ||
      trackedConsumer.participantId !== participantId
    ) {
      throw new AppError("The requested media subscription is unavailable", 404, "CONSUMER_NOT_FOUND");
    }

    await trackedConsumer.consumer.resume();
  }

  /** Closes routing objects owned by a disconnected browser. */
  public closeParticipantMedia(meetingCode: string, participantId: string): ProducedTrack[] {
    const removedProducers: ProducedTrack[] = [];
    for (const producer of this.producers.values()) {
      if (producer.meetingCode === meetingCode && producer.participantId === participantId) {
        this.producers.delete(producer.id);
        removedProducers.push(producer);
      }
    }
    for (const [consumerId, trackedConsumer] of this.consumers) {
      if (trackedConsumer.meetingCode === meetingCode && trackedConsumer.participantId === participantId) {
        trackedConsumer.consumer.close();
        this.consumers.delete(consumerId);
      }
    }
    return removedProducers;
  }

  /** Restricts browser-published tracks to microphone audio and camera video. */
  public static parseKind(input: unknown): MediaKind {
    if (input === "audio" || input === "video") {
      return input;
    }
    throw new AppError("Media kind must be audio or video", 400, "INVALID_MEDIA_KIND");
  }

  /** Performs a minimal shape check before mediasoup validates detailed RTP fields. */
  public static parseRtpObject(input: unknown): RtpParameters {
    if (!input || typeof input !== "object") {
      throw new AppError("Valid RTP parameters are required", 400, "INVALID_RTP_PARAMETERS");
    }
    return input as RtpParameters;
  }

  /** Performs a minimal shape check before mediasoup evaluates receive capabilities. */
  public static parseRtpCapabilities(input: unknown): RtpCapabilities {
    if (!input || typeof input !== "object") {
      throw new AppError("Valid RTP capabilities are required", 400, "INVALID_RTP_CAPABILITIES");
    }
    return input;
  }
}
