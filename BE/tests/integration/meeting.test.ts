import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/meetings/meeting.service", () => ({
  MeetingService: class {
    public createMeeting = vi.fn().mockResolvedValue({
      code: "ixv-ztow-trp",
      passcode: "ixv-ztow-trp",
      meetingUrl: "http://localhost:3000/ixv-ztow-trp",
      hostUrl: "http://localhost:3000/host/ixv-ztow-trp",
      hostToken: "private-host-token-that-is-long-enough",
      createdAt: new Date("2026-11-21T12:00:00.000Z"),
    });

    public getMeeting = vi.fn().mockResolvedValue({
      code: "ixv-ztow-trp",
      meetingUrl: "http://localhost:3000/ixv-ztow-trp",
      status: "active",
      createdAt: new Date("2026-11-21T12:00:00.000Z"),
    });

    public verifyHostAccess = vi.fn().mockResolvedValue({
      code: "ixv-ztow-trp",
      meetingUrl: "http://localhost:3000/ixv-ztow-trp",
      status: "active",
      createdAt: new Date("2026-11-21T12:00:00.000Z"),
    });
  },
}));

import { createApp } from "../../src/app";

describe("POST /api/v1/meetings", () => {
  it("returns a newly created short meeting link", async () => {
    const response = await request(createApp()).post("/api/v1/meetings");

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: {
        meeting: {
          code: "ixv-ztow-trp",
          passcode: "ixv-ztow-trp",
          url: "http://localhost:3000/ixv-ztow-trp",
          hostUrl: "http://localhost:3000/host/ixv-ztow-trp?token=private-host-token-that-is-long-enough",
          createdAt: "2026-11-21T12:00:00.000Z",
        },
      },
    });
  });

  it("exchanges a valid host token for a host-session cookie", async () => {
    const response = await request(createApp())
      .post("/api/v1/meetings/ixv-ztow-trp/host-session")
      .send({ token: "private-host-token-that-is-long-enough" });

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.body).toMatchObject({ data: { role: "host" } });
  });

  it("returns an active meeting by its short code", async () => {
    const response = await request(createApp()).get(
      "/api/v1/meetings/ixv-ztow-trp",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        meeting: {
          code: "ixv-ztow-trp",
          url: "http://localhost:3000/ixv-ztow-trp",
          status: "active",
          createdAt: "2026-11-21T12:00:00.000Z",
        },
      },
    });
  });

  it("rejects an invalid meeting-code format", async () => {
    const response = await request(createApp()).get(
      "/api/v1/meetings/not-valid",
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: "INVALID_MEETING_CODE" },
    });
  });
});
