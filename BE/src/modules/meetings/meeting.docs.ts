import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import type { ZodType } from "zod";

import {
  CreateMeetingResponseSchema,
  GetMeetingResponseSchema,
  GuestSessionResponseSchema,
  HostAccessBodySchema,
  HostAccessResponseSchema,
  MeetingCodeSchema,
  MeetingParamsSchema,
  MeetingSchema,
} from "./meeting.schemas";

export function registerMeetingDocs(
  registry: OpenAPIRegistry,
  errorResponseSchema: ZodType,
): void {
  registry.register("MeetingCode", MeetingCodeSchema);
  registry.register("Meeting", MeetingSchema);

  registry.registerPath({
    method: "post",
    path: "/api/v1/meetings",
    tags: ["Meetings"],
    summary: "Create a meeting",
    description:
      "Creates a meeting with a public guest link and a private host link. The code also acts as the guest passcode.",
    responses: {
      201: {
        description: "Meeting created successfully",
        content: {
          "application/json": {
            schema: CreateMeetingResponseSchema,
          },
        },
      },
      500: {
        description: "Unexpected server error",
        content: {
          "application/json": {
            schema: errorResponseSchema,
          },
        },
      },
      503: {
        description: "A unique meeting code could not be allocated",
        content: {
          "application/json": {
            schema: errorResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/meetings/{meetingCode}/host-session",
    tags: ["Meetings"],
    summary: "Exchange a private host link for a host session",
    description: "Verifies the host token and creates an HttpOnly host-session cookie.",
    request: {
      params: MeetingParamsSchema,
      body: {
        content: { "application/json": { schema: HostAccessBodySchema } },
      },
    },
    responses: {
      200: { description: "Host session established", content: { "application/json": { schema: HostAccessResponseSchema } } },
      400: { description: "Invalid input", content: { "application/json": { schema: errorResponseSchema } } },
      403: { description: "Invalid host link", content: { "application/json": { schema: errorResponseSchema } } },
      410: { description: "Meeting has ended", content: { "application/json": { schema: errorResponseSchema } } },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/meetings/{meetingCode}/host-access",
    tags: ["Meetings"],
    summary: "Check host-session access",
    description: "Confirms that the browser has an active host-session cookie for the meeting.",
    request: { params: MeetingParamsSchema },
    responses: {
      200: { description: "Host access confirmed", content: { "application/json": { schema: HostAccessResponseSchema } } },
      403: { description: "Host session required", content: { "application/json": { schema: errorResponseSchema } } },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/meetings/{meetingCode}/guest-session",
    tags: ["Meetings"],
    summary: "Establish a guest session",
    description: "Sets an HttpOnly cookie for an active meeting. The session receives admission only after host approval.",
    request: { params: MeetingParamsSchema },
    responses: {
      204: { description: "Guest session is ready" },
      404: { description: "Meeting not found" },
      410: { description: "Meeting has ended" },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/meetings/{meetingCode}/guest-session",
    tags: ["Meetings"],
    summary: "Check saved guest admission",
    request: { params: MeetingParamsSchema },
    responses: {
      200: {
        description: "Saved display name, or null when the guest session has no approval",
        content: { "application/json": { schema: GuestSessionResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/meetings/{meetingCode}",
    tags: ["Meetings"],
    summary: "Check a meeting",
    description: "Checks whether a meeting code exists and is currently active.",
    request: {
      params: MeetingParamsSchema,
    },
    responses: {
      200: {
        description: "Active meeting details",
        content: {
          "application/json": { schema: GetMeetingResponseSchema },
        },
      },
      400: {
        description: "Invalid meeting code format",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      404: {
        description: "Meeting not found",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      410: {
        description: "Meeting has ended",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      500: {
        description: "Unexpected server error",
        content: { "application/json": { schema: errorResponseSchema } },
      },
    },
  });
}
