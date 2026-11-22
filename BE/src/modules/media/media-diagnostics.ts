import type { Consumer, Producer, WebRtcTransport } from "mediasoup/types";

type Fields = Record<string, string | number | boolean | null | undefined>;
type TrackObserver = {
  on(event: "pause" | "resume", listener: () => void): unknown;
  once(event: "close", listener: () => void): unknown;
};
const STATS_INTERVAL_MS = 3_000;

export function mediaDiagnosticsEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

/** Short labels let us match a browser to its SFU objects without printing meeting details. */
export function mediaTraceId(id: string): string {
  return id.slice(-12);
}

/** Writes a single UTC-stamped line using only the fields selected by the caller. */
export function logMediaDiagnostic(event: string, fields: Fields): void {
  if (!mediaDiagnosticsEnabled()) return;
  console.info("[huddilo:media:be]", JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

/** Logs transport state and samples RTP counters until mediasoup closes the transport. */
export function observeMediaTransport(transport: WebRtcTransport, participantId: string, direction: string): void {
  if (!mediaDiagnosticsEnabled()) return;

  const labels = { client: mediaTraceId(participantId), transport: mediaTraceId(transport.id), direction };
  const tracks = new Map<Producer | Consumer, Fields>();
  let sampling = false;
  logMediaDiagnostic("transport.created", { ...labels, protocols: transport.iceCandidates.map(({ protocol }) => protocol).join(",") });
  transport.on("icestatechange", (state) => logMediaDiagnostic("transport.ice", { ...labels, state }));
  transport.on("dtlsstatechange", (state) => logMediaDiagnostic("transport.dtls", { ...labels, state }));
  transport.on("iceselectedtuplechange", ({ protocol }) => logMediaDiagnostic("transport.route", { ...labels, protocol }));

  /** Tracks each Producer or Consumer through its shared pause, resume, and close events. */
  function watchTrack(track: Producer | Consumer, trackLabels: Fields): void {
    const observer: TrackObserver = track.observer;
    tracks.set(track, trackLabels);
    logMediaDiagnostic("track.created", { ...trackLabels, paused: track.paused, type: track.type });
    observer.on("pause", () => logMediaDiagnostic("track.paused", trackLabels));
    observer.on("resume", () => logMediaDiagnostic("track.resumed", trackLabels));
    observer.once("close", () => {
      tracks.delete(track);
      logMediaDiagnostic("track.closed", trackLabels);
    });
  }

  transport.observer.on("newproducer", (producer) => {
    watchTrack(producer, { ...labels, producer: mediaTraceId(producer.id), kind: producer.kind });
  });
  transport.observer.on("newconsumer", (consumer) => {
    const trackLabels = { ...labels, consumer: mediaTraceId(consumer.id), producer: mediaTraceId(consumer.producerId), kind: consumer.kind };
    watchTrack(consumer, trackLabels);
    consumer.on("layerschange", (layers) => logMediaDiagnostic("track.layers", {
      ...trackLabels, spatial: layers?.spatialLayer ?? null, temporal: layers?.temporalLayer ?? null,
    }));
    consumer.on("producerpause", () => logMediaDiagnostic("track.producer_paused", trackLabels));
    consumer.on("producerresume", () => logMediaDiagnostic("track.producer_resumed", trackLabels));
  });

  async function sample(): Promise<void> {
    if (transport.closed || sampling || transport.dtlsState === "new") return;
    sampling = true;
    try {
      const transportStats = transport.getStats().then(([stats]) => {
        if (!stats || transport.closed) return;
        logMediaDiagnostic("transport.stats", {
          ...labels,
          protocol: stats.iceSelectedTuple?.protocol, iceState: stats.iceState, dtlsState: stats.dtlsState,
          rtpBytesIn: stats.rtpBytesReceived, rtpBytesOut: stats.rtpBytesSent,
          rtpInBps: stats.rtpRecvBitrate, rtpOutBps: stats.rtpSendBitrate,
          availableOutBps: stats.availableOutgoingBitrate,
        });
      }).catch(() => {
        if (!transport.closed) logMediaDiagnostic("transport.stats_unavailable", labels);
      });
      const trackStats = [...tracks].map(async ([track, fields]) => {
        try {
          const rows = await track.getStats();
          if (track.closed) return;
          const type = direction === "send" ? "inbound-rtp" : "outbound-rtp";
          for (const row of rows) {
            if (row.type !== type) continue;
            logMediaDiagnostic("track.stats", {
              ...fields, rid: row.rid, codec: row.mimeType,
              packets: row.packetCount, bytes: row.byteCount, bitrate: row.bitrate,
              lost: row.packetsLost, retransmitted: row.packetsRetransmitted, nack: row.nackCount,
              pli: row.pliCount, fir: row.firCount, score: row.score,
            });
          }
        } catch {
          if (!track.closed) logMediaDiagnostic("track.stats_unavailable", fields);
        }
      });
      await Promise.all([transportStats, ...trackStats]);
    } finally {
      sampling = false;
    }
  }

  const timer = setInterval(() => { void sample(); }, STATS_INTERVAL_MS).unref();
  transport.observer.once("close", () => {
    clearInterval(timer);
    tracks.clear();
    logMediaDiagnostic("transport.closed", labels);
  });
}
