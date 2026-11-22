import { describe, expect, it, vi } from "vitest";

import type { MeetingRepositoryContract } from "../../src/modules/meetings/meeting.repository";
import { MeetingService } from "../../src/modules/meetings/meeting.service";

function createRepositoryMock() {
  const create = vi.fn<MeetingRepositoryContract["create"]>().mockImplementation(
    (input) =>
      Promise.resolve({
        ...input,
        createdAt: new Date("2026-11-21T12:00:00.000Z"),
      }),
  );
  const repository: MeetingRepositoryContract = {
    codeExists: vi.fn().mockResolvedValue(false),
    create,
    findByCode: vi.fn().mockResolvedValue(null),
    findHostMeetingByCode: vi.fn().mockResolvedValue(null),
  };

  return { repository, create };
}

describe("MeetingService", () => {
  it("generates a short Google Meet-style code", () => {
    const { repository } = createRepositoryMock();
    const service = new MeetingService(repository);

    expect(service.generateMeetingCode()).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  });

  it("creates a meeting with the code as its passcode", async () => {
    const { repository, create } = createRepositoryMock();
    const service = new MeetingService(repository, "http://localhost:3000");

    const meeting = await service.createMeeting();

    expect(meeting.code).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(meeting.passcode).toBe(meeting.code);
    expect(meeting.meetingUrl).toBe(`http://localhost:3000/${meeting.code}`);
    expect(create).toHaveBeenCalledOnce();
    expect(meeting.hostUrl).toBe(`http://localhost:3000/host/${meeting.code}`);
    expect(meeting.hostToken).toHaveLength(43);
  });

  it("verifies the private host token without exposing it", async () => {
    const { repository } = createRepositoryMock();
    repository.findHostMeetingByCode = vi.fn().mockResolvedValue({
      code: "ixv-ztow-trp",
      meetingUrl: "http://localhost:3000/ixv-ztow-trp",
      hostToken: "a-private-host-token-that-is-long-enough",
      status: "active",
      createdAt: new Date("2026-11-21T12:00:00.000Z"),
    });
    const service = new MeetingService(repository);

    await expect(service.verifyHostAccess("ixv-ztow-trp", "a-private-host-token-that-is-long-enough")).resolves.toMatchObject({
      code: "ixv-ztow-trp",
      status: "active",
    });
  });

  it("returns an active meeting by code", async () => {
    const { repository } = createRepositoryMock();
    const storedMeeting = {
      code: "ixv-ztow-trp",
      meetingUrl: "http://localhost:3000/ixv-ztow-trp",
      status: "active" as const,
      createdAt: new Date("2026-11-21T12:00:00.000Z"),
    };
    repository.findByCode = vi.fn().mockResolvedValue(storedMeeting);
    const service = new MeetingService(repository);

    await expect(service.getMeeting(storedMeeting.code)).resolves.toEqual(
      storedMeeting,
    );
  });
});
