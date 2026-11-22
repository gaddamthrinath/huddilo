"use client";

import { io, type Socket } from "socket.io-client";

const REALTIME_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let meetingSocket: Socket | undefined;

/**
 * Returns the shared Socket.IO connection used by the current browser tab.
 *
 * `withCredentials` sends the host-session cookie when the browser entered
 * through a private host link.
 */
export function getMeetingSocket(): Socket {
  if (!meetingSocket) {
    meetingSocket = io(REALTIME_URL, {
      autoConnect: false,
      transports: ["websocket"],
      withCredentials: true,
    });
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
  return new Promise((resolve, reject) => {
    socket.timeout(10_000).emit(
      event,
      ...args,
      (error: Error | null, response: Response) => {
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
