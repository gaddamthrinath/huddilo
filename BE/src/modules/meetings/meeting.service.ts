import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { env } from "../../config/env";
import { AppError } from "../../common/errors/app-error";
import type {
  MeetingRepositoryContract,
  MeetingLookup,
  StoredMeeting,
} from "./meeting.repository";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const MAX_GENERATION_ATTEMPTS = 10;

export class MeetingService {
  public constructor(
    private readonly meetingRepository: MeetingRepositoryContract,
    private readonly appBaseUrl = env.APP_BASE_URL,
  ) {}

  public async createMeeting(): Promise<StoredMeeting> {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const code = this.generateMeetingCode();

      if (await this.meetingRepository.codeExists(code)) {
        continue;
      }

      try {
        const hostToken = randomBytes(32).toString("base64url");
        return await this.meetingRepository.create({
          code,
          passcode: code,
          meetingUrl: new URL(code, `${this.appBaseUrl}/`).toString(),
          hostUrl: new URL(`host/${code}`, `${this.appBaseUrl}/`).toString(),
          hostToken,
        });
      } catch (error: unknown) {
        if (this.isDuplicateKeyError(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new AppError(
      "Unable to generate a unique meeting code",
      503,
      "MEETING_CODE_UNAVAILABLE",
    );
  }

  public async verifyHostAccess(code: string, hostToken: string): Promise<MeetingLookup> {
    const meeting = await this.meetingRepository.findHostMeetingByCode(code);

    if (!meeting || !this.tokensMatch(meeting.hostToken, hostToken)) {
      throw new AppError("This host link is invalid or has expired", 403, "INVALID_HOST_LINK");
    }

    if (meeting.status === "ended") {
      throw new AppError("This meeting has ended", 410, "MEETING_ENDED");
    }

    return {
      code: meeting.code,
      meetingUrl: meeting.meetingUrl,
      status: meeting.status,
      createdAt: meeting.createdAt,
    };
  }

  public async getMeeting(code: string): Promise<MeetingLookup> {
    const meeting = await this.meetingRepository.findByCode(code);

    if (!meeting) {
      throw new AppError(
        "The meeting could not be found",
        404,
        "MEETING_NOT_FOUND",
      );
    }

    if (meeting.status === "ended") {
      throw new AppError(
        "This meeting has ended",
        410,
        "MEETING_ENDED",
      );
    }

    return meeting;
  }

  public generateMeetingCode(): string {
    return `${this.randomLetters(3)}-${this.randomLetters(4)}-${this.randomLetters(3)}`;
  }

  private randomLetters(length: number): string {
    return Array.from(
      { length },
      () => ALPHABET[randomInt(0, ALPHABET.length)] ?? "a",
    ).join("");
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11_000
    );
  }

  private tokensMatch(storedToken: string, suppliedToken: string): boolean {
    const stored = Buffer.from(storedToken);
    const supplied = Buffer.from(suppliedToken);

    return stored.length === supplied.length && timingSafeEqual(stored, supplied);
  }
}
