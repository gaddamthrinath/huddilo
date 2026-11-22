import { randomBytes } from "node:crypto";

import { AppError } from "../../common/errors/app-error";

export const GUEST_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function getGuestCookieName(meetingCode: string): string {
  return `huddilo_guest_${meetingCode.replace(/-/g, "_")}`;
}

type GuestSession = {
  meetingCode: string;
  expiresAt: number;
  approvedName?: string;
  socketId?: string;
};

/** Stores the host's approval separately from the current Socket.IO connection. */
export class GuestSessionService {
  private readonly sessions = new Map<string, GuestSession>();
  private nextCleanup = 0;

  public ensure(meetingCode: string, cookie?: string): string {
    const now = Date.now();
    if (now >= this.nextCleanup) {
      for (const [id, session] of this.sessions) {
        if (session.expiresAt <= now) this.sessions.delete(id);
      }
      this.nextCleanup = now + 60_000;
    }
    if (cookie && this.find(meetingCode, cookie)) return cookie;

    const id = randomBytes(32).toString("base64url");
    this.sessions.set(id, { meetingCode, expiresAt: now + GUEST_SESSION_TTL_MS });
    return id;
  }

  public approvedName(meetingCode: string, cookie?: string): string | undefined {
    return this.find(meetingCode, cookie)?.approvedName;
  }

  public claim(meetingCode: string, cookie: string | undefined, socketId: string): boolean {
    const session = this.find(meetingCode, cookie);
    if (!session) return false;
    if (session.socketId && session.socketId !== socketId) {
      throw new AppError("This guest session is already connected. Leave the call in the other tab or try again shortly.", 409, "GUEST_SESSION_IN_USE");
    }
    session.socketId = socketId;
    return Boolean(session.approvedName);
  }

  public approve(meetingCode: string, cookie: string | undefined, socketId: string, name: string): void {
    const session = this.find(meetingCode, cookie);
    if (session?.socketId === socketId) session.approvedName = name;
  }

  public release(meetingCode: string, cookie: string | undefined, socketId: string): void {
    const session = this.find(meetingCode, cookie);
    if (session?.socketId === socketId) delete session.socketId;
  }

  private find(meetingCode: string, cookie?: string): GuestSession | undefined {
    const session = cookie ? this.sessions.get(cookie) : undefined;
    return session?.meetingCode === meetingCode && session.expiresAt > Date.now() ? session : undefined;
  }
}
