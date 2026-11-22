type DiagnosticDetails = Record<string, string | number | boolean | null | undefined>;
type DiagnosticEntry = { at: string; event: string; details?: DiagnosticDetails };
type StatsRow = Record<string, unknown>;

const STORAGE_KEY = "huddilo-media-diagnostics-v1";
const MAX_ENTRIES = 240;
let entries: DiagnosticEntry[] | undefined;

export function isMeetingDiagnosticsEnabled(): boolean {
  return process.env.NODE_ENV === "development"
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("mediaDebug") === "1";
}

/** Matches the short connection and media IDs used by the backend trace. */
export function mediaTraceId(id: string | undefined): string | undefined {
  return id?.slice(-12);
}

function diagnosticEntries(): DiagnosticEntry[] {
  if (entries) return entries;

  let previous: unknown;
  try {
    previous = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    // Retain diagnostics in memory when session storage is unavailable.
  }
  entries = Array.isArray(previous) ? previous.slice(-MAX_ENTRIES) : [];
  return entries;
}

/** Record only named fields supplied by the app, never a raw WebRTC stats report. */
export function recordMeetingDiagnostic(event: string, details?: DiagnosticDetails): void {
  if (!isMeetingDiagnosticsEnabled()) return;
  const records = diagnosticEntries();
  const entry = { at: new Date().toISOString(), event, details };
  console.info("[huddilo:media:fe]", JSON.stringify(entry));
  records.push(entry);
  if (records.length > MAX_ENTRIES) records.splice(0, records.length - MAX_ENTRIES);

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Export remains available from the in-memory trace.
  }
}

export function downloadMeetingDiagnostics(): void {
  if (!isMeetingDiagnosticsEnabled()) return;
  const report = new Blob([JSON.stringify({ entries: diagnosticEntries() }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(report);
  const link = document.createElement("a");
  link.href = url;
  link.download = "huddilo-media-diagnostics.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function enumValue(value: unknown, accepted: readonly string[]): string | undefined {
  return typeof value === "string" && accepted.includes(value) ? value : undefined;
}

function addCounters(details: DiagnosticDetails, rows: StatsRow[], prefix: string, keys: readonly string[]) {
  for (const key of keys) {
    const values = rows.map((row) => finiteNumber(row[key])).filter((value) => value !== undefined);
    if (values.length) {
      details[`${prefix}${key[0].toUpperCase()}${key.slice(1)}`] = values.reduce((sum, value) => sum + value, 0);
    }
  }
}

function maximum(rows: StatsRow[], key: string): number | undefined {
  const values = rows.map((row) => finiteNumber(row[key])).filter((value) => value !== undefined);
  return values.length ? Math.max(...values) : undefined;
}

/** Summarize connection and RTP counters without exposing candidate addresses or identifiers. */
export function summarizeMediaStats(report: RTCStatsReport, direction: "send" | "receive"): DiagnosticDetails {
  const rows = new Map<string, StatsRow>();
  report.forEach((row: StatsRow, id) => rows.set(id, row));
  const allRows = Array.from(rows.values());
  const transport = allRows.find((row) => row.type === "transport");
  const selectedPairId = transport?.selectedCandidatePairId;
  const selectedPair = typeof selectedPairId === "string" ? rows.get(selectedPairId) : undefined;
  const nominatedPairs = allRows.filter((row) =>
    row.type === "candidate-pair" && row.nominated === true && row.state === "succeeded");
  const pair = selectedPair ?? (nominatedPairs.length === 1 ? nominatedPairs[0] : undefined);
  const local = typeof pair?.localCandidateId === "string" ? rows.get(pair.localCandidateId) : undefined;
  const remote = typeof pair?.remoteCandidateId === "string" ? rows.get(pair.remoteCandidateId) : undefined;
  const candidateTypes = ["host", "srflx", "prflx", "relay"];
  const rtt = finiteNumber(pair?.currentRoundTripTime);
  const details: DiagnosticDetails = {
    direction,
    iceState: enumValue(transport?.iceState, ["new", "checking", "connected", "completed", "disconnected", "failed", "closed"]),
    dtlsState: enumValue(transport?.dtlsState, ["new", "connecting", "connected", "closed", "failed"]),
    candidatePairChanges: finiteNumber(transport?.selectedCandidatePairChanges),
    pairSource: selectedPair ? "selected" : pair ? "nominated" : undefined,
    protocol: enumValue(local?.protocol ?? remote?.protocol, ["udp", "tcp"]),
    localRelayProtocol: enumValue(local?.relayProtocol, ["udp", "tcp", "tls"]),
    localCandidateType: enumValue(local?.candidateType, candidateTypes),
    remoteCandidateType: enumValue(remote?.candidateType, candidateTypes),
    roundTripMs: rtt === undefined ? undefined : Math.round(rtt * 1000),
    pairBytesReceived: finiteNumber(pair?.bytesReceived),
    pairBytesSent: finiteNumber(pair?.bytesSent),
  };

  const streamType = direction === "receive" ? "inbound-rtp" : "outbound-rtp";
  for (const kind of ["audio", "video"]) {
    const streams = allRows.filter((row) => row.type === streamType && (row.kind ?? row.mediaType) === kind);
    details[`${kind}Streams`] = streams.length;
    if (direction === "receive") {
      addCounters(details, streams, kind, ["packetsReceived", "packetsLost", "bytesReceived"]);
      const jitter = maximum(streams, "jitter");
      if (jitter !== undefined) details[`${kind}JitterMs`] = Math.round(jitter * 1000);
      if (kind === "video") {
        addCounters(details, streams, kind, ["framesReceived", "framesDecoded", "framesRendered", "framesDropped", "freezeCount"]);
      }
    } else {
      addCounters(details, streams, kind, ["packetsSent", "bytesSent", "retransmittedPacketsSent"]);
      const remoteInbound = allRows.filter((row) => row.type === "remote-inbound-rtp" && row.kind === kind);
      addCounters(details, remoteInbound, `${kind}Remote`, ["packetsLost"]);
      if (kind === "video") {
        addCounters(details, streams, kind, ["framesEncoded", "framesSent"]);
        details.videoCpuLimited = streams.some((row) => row.qualityLimitationReason === "cpu");
        details.videoBandwidthLimited = streams.some((row) => row.qualityLimitationReason === "bandwidth");
      }
    }
    if (kind === "video") details.videoMaxFramesPerSecond = maximum(streams, "framesPerSecond");
  }
  return details;
}
