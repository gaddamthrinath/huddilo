import type { Request, Response } from "express";

import { successResponse } from "../../common/utils/api-response";
import { AppError } from "../../common/errors/app-error";
import { HostAccessBodySchema, MeetingParamsSchema } from "./meeting.schemas";
import type { MeetingService } from "./meeting.service";

export class MeetingController {
  public constructor(private readonly meetingService: MeetingService) {}

  public create = async (_request: Request, response: Response): Promise<void> => {
    const meeting = await this.meetingService.createMeeting();

    response.status(201).json(
      successResponse({
        meeting: {
          code: meeting.code,
          passcode: meeting.passcode,
          url: meeting.meetingUrl,
          hostUrl: `${meeting.hostUrl}?token=${meeting.hostToken}`,
          createdAt: meeting.createdAt.toISOString(),
        },
      }),
    );
  };

  public getByCode = async (request: Request, response: Response): Promise<void> => {
    const meeting = await this.meetingService.getMeeting(this.parseMeetingCode(request));

    response.status(200).json(
      successResponse({
        meeting: {
          code: meeting.code,
          url: meeting.meetingUrl,
          status: meeting.status,
          createdAt: meeting.createdAt.toISOString(),
        },
      }),
    );
  };

  public createHostSession = async (request: Request, response: Response): Promise<void> => {
    const meetingCode = this.parseMeetingCode(request);
    const parsedBody = HostAccessBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError("The host link is missing its private token", 400, "INVALID_HOST_LINK");
    }

    const meeting = await this.meetingService.verifyHostAccess(meetingCode, parsedBody.data.token);

    response.cookie(this.hostCookieName(meeting.code), parsedBody.data.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 12,
      path: "/",
    });

    response.status(200).json(successResponse({
      role: "host" as const,
      meeting: {
        code: meeting.code,
        url: meeting.meetingUrl,
        status: meeting.status,
        createdAt: meeting.createdAt.toISOString(),
      },
    }));
  };

  public getHostAccess = async (request: Request, response: Response): Promise<void> => {
    const meetingCode = this.parseMeetingCode(request);
    const token = this.readCookie(request, this.hostCookieName(meetingCode));

    if (!token) {
      throw new AppError("Open your private host link to continue", 403, "HOST_SESSION_REQUIRED");
    }

    const meeting = await this.meetingService.verifyHostAccess(meetingCode, token);

    response.status(200).json(successResponse({
      role: "host" as const,
      meeting: {
        code: meeting.code,
        url: meeting.meetingUrl,
        status: meeting.status,
        createdAt: meeting.createdAt.toISOString(),
      },
    }));
  };

  private parseMeetingCode(request: Request): string {
    const parsedParams = MeetingParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError("The meeting code format is invalid", 400, "INVALID_MEETING_CODE", parsedParams.error.flatten().fieldErrors);
    }

    return parsedParams.data.meetingCode;
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookies = request.headers.cookie?.split(";") ?? [];
    const item = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
    return item ? decodeURIComponent(item.trim().slice(name.length + 1)) : undefined;
  }

  private hostCookieName(meetingCode: string): string {
    return `huddilo_host_${meetingCode.replace(/-/g, "_")}`;
  }
}
