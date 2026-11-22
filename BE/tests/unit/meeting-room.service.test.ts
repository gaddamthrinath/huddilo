import { describe, expect, it } from "vitest";

import { MeetingRoomService } from "../../src/modules/rooms/meeting-room.service";

describe("MeetingRoomService", () => {
  it("keeps a guest waiting until the room host admits them", () => {
    const rooms = new MeetingRoomService();
    const host = rooms.openHostRoom("abc-defg-hij", {
      id: "host-1",
      displayName: "Asha",
    });
    const guest = rooms.requestGuestJoin("abc-defg-hij", {
      id: "guest-1",
      displayName: "Jordan",
    });

    expect(host).toMatchObject({ role: "host", access: "admitted" });
    expect(guest).toMatchObject({ role: "guest", access: "waiting" });
    expect(rooms.isParticipantAdmitted("abc-defg-hij", "guest-1")).toBe(false);

    const admittedGuest = rooms.admitGuest(
      "abc-defg-hij",
      "host-1",
      "guest-1",
    );

    expect(admittedGuest.access).toBe("admitted");
    expect(rooms.isParticipantAdmitted("abc-defg-hij", "guest-1")).toBe(true);
  });

  it("prevents a guest from admitting another guest", () => {
    const rooms = new MeetingRoomService();
    rooms.openHostRoom("abc-defg-hij", { id: "host-1", displayName: "Asha" });
    rooms.requestGuestJoin("abc-defg-hij", { id: "guest-1", displayName: "Jordan" });
    rooms.requestGuestJoin("abc-defg-hij", { id: "guest-2", displayName: "Sam" });

    expect(() =>
      rooms.admitGuest("abc-defg-hij", "guest-1", "guest-2"),
    ).toThrow("Only the meeting host");
  });
});
