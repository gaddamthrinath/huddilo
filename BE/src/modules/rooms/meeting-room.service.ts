import { AppError } from "../../common/errors/app-error";

export type ParticipantRole = "host" | "guest";
export type ParticipantAccess = "waiting" | "admitted";

export type RoomParticipant = {
  id: string;
  displayName: string;
  role: ParticipantRole;
  access: ParticipantAccess;
};

type ParticipantInput = Pick<RoomParticipant, "id" | "displayName">;

type MeetingRoom = {
  hostParticipantId: string | null;
  participantsById: Map<string, RoomParticipant>;
};

/** Holds ephemeral participant and waiting-room state for active meetings. */
export class MeetingRoomService {
  private readonly roomsByMeetingCode = new Map<string, MeetingRoom>();

  /** Creates a live room for the host or restores the host's existing room entry. */
  public openHostRoom(
    meetingCode: string,
    participant: ParticipantInput,
  ): RoomParticipant {
    const existingRoom = this.roomsByMeetingCode.get(meetingCode);

    if (existingRoom) {
      if (!existingRoom.hostParticipantId) {
        const host: RoomParticipant = { ...participant, role: "host", access: "admitted" };
        existingRoom.hostParticipantId = host.id;
        existingRoom.participantsById.set(host.id, host);
        return { ...host };
      }

      if (existingRoom.hostParticipantId !== participant.id) {
        throw new AppError(
          "A different host already controls this meeting room",
          409,
          "HOST_ALREADY_CONNECTED",
        );
      }

      return this.requireParticipant(existingRoom, participant.id);
    }

    const host: RoomParticipant = {
      ...participant,
      role: "host",
      access: "admitted",
    };
    this.roomsByMeetingCode.set(meetingCode, {
      hostParticipantId: host.id,
      participantsById: new Map([[host.id, host]]),
    });

    return { ...host };
  }

  /** Adds a guest to the waiting room while preserving an already admitted guest. */
  public requestGuestJoin(
    meetingCode: string,
    participant: ParticipantInput,
  ): RoomParticipant {
    const room = this.requireRoom(meetingCode);
    const existingParticipant = room.participantsById.get(participant.id);

    if (existingParticipant?.role === "host") {
      throw new AppError("The host cannot request guest access", 403, "HOST_REQUIRED");
    }

    if (existingParticipant?.access === "admitted") {
      return { ...existingParticipant };
    }

    const guest: RoomParticipant = {
      ...participant,
      role: "guest",
      access: "waiting",
    };
    room.participantsById.set(guest.id, guest);

    return { ...guest };
  }

  /** Restores a guest after the gateway has verified their saved host approval. */
  public restoreApprovedGuest(meetingCode: string, participant: ParticipantInput): RoomParticipant {
    let room = this.roomsByMeetingCode.get(meetingCode);
    if (!room) {
      room = { hostParticipantId: null, participantsById: new Map() };
      this.roomsByMeetingCode.set(meetingCode, room);
    }
    const guest: RoomParticipant = { ...participant, role: "guest", access: "admitted" };
    room.participantsById.set(guest.id, guest);
    return { ...guest };
  }

  /** Lets the current host promote one waiting guest into the active meeting. */
  public admitGuest(
    meetingCode: string,
    hostParticipantId: string,
    guestParticipantId: string,
  ): RoomParticipant {
    const room = this.requireRoom(meetingCode);

    if (room.hostParticipantId !== hostParticipantId) {
      throw new AppError("Only the meeting host can admit guests", 403, "HOST_REQUIRED");
    }

    const guest = room.participantsById.get(guestParticipantId);
    if (!guest) {
      throw new AppError("The participant could not be found in this meeting room", 404, "PARTICIPANT_NOT_FOUND");
    }
    if (guest.role !== "guest") {
      throw new AppError("Only a guest can be admitted", 400, "GUEST_REQUIRED");
    }

    guest.access = "admitted";
    return { ...guest };
  }

  /** Answers whether a participant is currently allowed to receive media access. */
  public isParticipantAdmitted(
    meetingCode: string,
    participantId: string,
  ): boolean {
    const participant = this.roomsByMeetingCode
      .get(meetingCode)
      ?.participantsById.get(participantId);

    return participant?.access === "admitted";
  }

  /** Returns a copy of current room participants for a future host waiting-room UI. */
  public getParticipants(meetingCode: string): RoomParticipant[] {
    const room = this.requireRoom(meetingCode);
    return [...room.participantsById.values()].map((participant) => ({
      ...participant,
    }));
  }

  /** Returns only people who have passed the waiting room for the live meeting UI. */
  public getAdmittedParticipants(meetingCode: string): RoomParticipant[] {
    return this.getParticipants(meetingCode).filter((participant) => participant.access === "admitted");
  }

  /** Remove disconnected sockets so the roster and waiting room stay current. */
  public removeParticipant(meetingCode: string, participantId: string): RoomParticipant | undefined {
    const room = this.roomsByMeetingCode.get(meetingCode);
    const participant = room?.participantsById.get(participantId);
    if (!room || !participant) return;

    room.participantsById.delete(participantId);
    if (room.hostParticipantId === participantId) room.hostParticipantId = null;
    if (!room.participantsById.size) this.roomsByMeetingCode.delete(meetingCode);
    return { ...participant };
  }

  private requireRoom(meetingCode: string): MeetingRoom {
    const room = this.roomsByMeetingCode.get(meetingCode);
    if (!room) {
      throw new AppError(
        "The host has not joined the meeting yet. Ask the host to open the meeting first.",
        409,
        "HOST_NOT_CONNECTED",
      );
    }

    return room;
  }

  private requireParticipant(
    room: MeetingRoom,
    participantId: string,
  ): RoomParticipant {
    const participant = room.participantsById.get(participantId);
    if (!participant) {
      throw new AppError("The participant could not be found in this meeting room", 404, "PARTICIPANT_NOT_FOUND");
    }

    return { ...participant };
  }
}
