import { AppError } from "../../common/errors/app-error";
import type { MeetingRoomService } from "../rooms/meeting-room.service";
import type { TurnCredentialService } from "./turn-credential.service";

export type IceServerConfiguration = {
  urls: readonly string[];
  username: string;
  credential: string;
};

/** Gives admitted meeting participants the browser configuration for TURN. */
export class MediaAccessService {
  public constructor(
    private readonly rooms: MeetingRoomService,
    private readonly turnCredentials: TurnCredentialService,
    private readonly turnUrls: readonly string[],
  ) {
    if (turnUrls.length === 0) {
      throw new Error("At least one TURN or STUN URL is required");
    }
  }

  /** Returns temporary ICE server credentials after host admission. */
  public getIceServerConfiguration(
    meetingCode: string,
    participantId: string,
  ): IceServerConfiguration {
    if (!this.rooms.isParticipantAdmitted(meetingCode, participantId)) {
      throw new AppError(
        "Wait for the host to admit you before connecting to meeting media",
        403,
        "PARTICIPANT_NOT_ADMITTED",
      );
    }

    const credentials = this.turnCredentials.createCredentials(participantId);

    return {
      urls: this.turnUrls,
      username: credentials.username,
      credential: credentials.credential,
    };
  }
}
