import "../../docs/zod-openapi";

import { z } from "zod";

export const MeetingCodeSchema = z
  .string()
  .regex(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/)
  .meta({
    description: "Short meeting code that also acts as the guest passcode",
    example: "ixv-ztow-trp",
  });

export const MeetingSchema = z.object({
  code: MeetingCodeSchema,
  passcode: MeetingCodeSchema,
  url: z.url().meta({ example: "http://localhost:3000/ixv-ztow-trp" }),
  hostUrl: z.url().meta({
    example: "http://localhost:3000/host/ixv-ztow-trp?token=private-host-token",
  }),
  createdAt: z.iso.datetime(),
});

export const HostAccessBodySchema = z.object({
  token: z.string().min(32).max(256).meta({
    description: "Private token carried only by the host link",
  }),
});

export const MeetingParamsSchema = z.object({
  meetingCode: MeetingCodeSchema,
});

export const PublicMeetingSchema = z.object({
  code: MeetingCodeSchema,
  url: z.url(),
  status: z.literal("active"),
  createdAt: z.iso.datetime(),
});

export const CreateMeetingResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    meeting: MeetingSchema,
  }),
});

export const GetMeetingResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    meeting: PublicMeetingSchema,
  }),
});

export const HostAccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    role: z.literal("host"),
    meeting: PublicMeetingSchema,
  }),
});
