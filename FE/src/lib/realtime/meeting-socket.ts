"use client";

import { io, type Socket } from "socket.io-client";

import { isMeetingDiagnosticsEnabled, mediaTraceId, recordMeetingDiagnostic } from "@/lib/media/meeting-diagnostics";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const REALTIME_URL = new URL(API_URL).origin;
const ICE_RESTART_EVENT = "media:restart-ice";

let meetingSocket: Socket | undefined;

function traceRequestFields(operation: string, value: unknown) {
  return {
    operation,
    direction: value === "send" || value === "receive" ? value : undefined,
    kind: operation === "media:produce" && (value === "audio" || value === "video") ? value : undefined,
  };
}

/** Distinguishes a missing acknowledgment from a response that rejects an operation. */
function traceAckResult(error: Error | null, response: unknown) {
  if (error) {
    if (error.message === "operation has timed out") return { outcome: "timeout" };
    if (error.message === "socket has been disconnected") return { outcome: "disconnected" };
    return { outcome: "transport_error" };
  }

  if (typeof response === "object" && response !== null && "success" in response) {
    if (response.success === true) return { outcome: "success" };
    if (response.success === false && "error" in response) {
      const failure = response.error;
      if (typeof failure === "object" && failure !== null && "code" in failure &&
          typeof failure.code === "string" && /^[A-Z][A-Z_]{1,63}$/.test(failure.code)) {
        return { outcome: "rejected", code: failure.code };
      }
    }
  }

  return { outcome: "rejected" };
}

/**
 * Returns the shared Socket.IO connection used by the current browser tab.
 *
 * `withCredentials` sends the host-session cookie when the browser entered
 * through a private host link.
 */
export function getMeetingSocket(): Socket {
  if (!meetingSocket) {
    const socket = io(REALTIME_URL, {
      autoConnect: false,
      transports: ["websocket"],
      withCredentials: true,
    });
    meetingSocket = socket;
    if (isMeetingDiagnosticsEnabled()) {
      let client: string | undefined;
      socket.on("connect", () => {
        client = mediaTraceId(socket.id);
        recordMeetingDiagnostic("signaling.connected", { client });
      });
      socket.on("disconnect", (reason) => {
        // Socket.IO supplies a fixed reason enum here. Its optional details may contain request data.
        recordMeetingDiagnostic("signaling.disconnected", { client, reason });
      });
      socket.on("connect_error", (error) => {
        const reason = error.message === "timeout" ? "timeout"
          : error.message === "websocket error" ? "websocket_error"
          : "connection_error";
        recordMeetingDiagnostic("signaling.connect_error", { reason });
      });
      socket.onAnyOutgoing((event, value: unknown) => {
        recordMeetingDiagnostic(event === ICE_RESTART_EVENT ? "signaling.ice_restart_sent" : "signaling.sent", {
          client, ...traceRequestFields(event, value),
        });
      });
      socket.onAny((operation) => {
        recordMeetingDiagnostic("signaling.event", { client, operation });
      });
    }
  }

  return meetingSocket;
}

/** Opens the realtime connection once and resolves when the backend accepts it. */
export function connectMeetingSocket(): Promise<Socket> {
  const socket = getMeetingSocket();

  if (socket.connected) {
    return Promise.resolve(socket);
  }

  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
    socket.connect();
  });
}

/** Sends a Socket.IO event and waits at most ten seconds for the backend reply. */
export function emitWithAck<Response>(
  socket: Socket,
  event: string,
  ...args: unknown[]
): Promise<Response> {
  const restartIce = event === ICE_RESTART_EVENT;
  const trace = isMeetingDiagnosticsEnabled() ? {
    startedAt: performance.now(),
    fields: { client: mediaTraceId(socket.id), ...traceRequestFields(event, args[0]) },
  } : undefined;
  if (trace) {
    recordMeetingDiagnostic(restartIce ? "signaling.ice_restart_requested" : "signaling.requested", {
      ...trace.fields, socketConnected: socket.connected,
    });
  }

  return new Promise((resolve, reject) => {
    socket.timeout(10_000).emit(
      event,
      ...args,
      (error: Error | null, response: Response) => {
        if (trace) {
          recordMeetingDiagnostic(restartIce ? "signaling.ice_restart_ack" : "signaling.ack", {
            ...trace.fields,
            ...traceAckResult(error, response),
            elapsedMs: Math.round(performance.now() - trace.startedAt),
          });
        }
        if (error) {
          reject(new Error("The meeting server did not respond in time."));
          return;
        }

        resolve(response);
      },
    );
  });
}

/** Closes the connection when the meeting page is left. */
export function disconnectMeetingSocket(): void {
  meetingSocket?.disconnect();
  meetingSocket = undefined;
}
