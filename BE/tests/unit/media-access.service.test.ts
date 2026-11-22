import { describe, expect, it } from "vitest";

import { AppError } from "../../src/common/errors/app-error";
import { MediaAccessService } from "../../src/modules/media/media-access.service";
import { TurnCredentialService } from "../../src/modules/media/turn-credential.service";
import { MeetingRoomService } from "../../src/modules/rooms/meeting-room.service";

describe("MediaAccessService", () => {
  it("gives TURN details only to an admitted participant", () => {
    const rooms = new MeetingRoomService();
    const access = new MediaAccessService(
      rooms,
      new TurnCredentialService("test-shared-secret"),
      ["stun:localhost:3478", "turn:localhost:3478?transport=udp"],
    );
    rooms.openHostRoom("abc-defg-hij", { id: "host-1", displayName: "Asha" });
    rooms.requestGuestJoin("abc-defg-hij", { id: "guest-1", displayName: "Jordan" });

    expect(() =>
      access.getIceServerConfiguration("abc-defg-hij", "guest-1"),
    ).toThrow(AppError);

    rooms.admitGuest("abc-defg-hij", "host-1", "guest-1");
    const iceServer = access.getIceServerConfiguration("abc-defg-hij", "guest-1");

    expect(iceServer.urls).toEqual([
      "stun:localhost:3478",
      "turn:localhost:3478?transport=udp",
    ]);
    expect(iceServer.username).toMatch(/:guest-1$/);
    expect(iceServer.credential.length).toBeGreaterThan(0);
  });
});
