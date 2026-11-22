import { MeetingModel } from "./meeting.model";

export type CreateMeetingRecord = {
  code: string;
  passcode: string;
  meetingUrl: string;
  hostUrl: string;
  hostToken: string;
};

export type StoredMeeting = CreateMeetingRecord & {
  createdAt: Date;
};

export type MeetingLookup = {
  code: string;
  meetingUrl: string;
  status: "active" | "ended";
  createdAt: Date;
};

export type HostMeetingLookup = MeetingLookup & {
  hostToken: string;
};

export interface MeetingRepositoryContract {
  codeExists(code: string): Promise<boolean>;
  create(input: CreateMeetingRecord): Promise<StoredMeeting>;
  findByCode(code: string): Promise<MeetingLookup | null>;
  findHostMeetingByCode(code: string): Promise<HostMeetingLookup | null>;
}

export class MeetingRepository implements MeetingRepositoryContract {
  public async codeExists(code: string): Promise<boolean> {
    return (await MeetingModel.exists({ code })) !== null;
  }

  public async create(input: CreateMeetingRecord): Promise<StoredMeeting> {
    const meeting = await MeetingModel.create(input);

    return {
      code: meeting.code,
      passcode: meeting.passcode,
      meetingUrl: meeting.meetingUrl,
      hostUrl: meeting.hostUrl,
      hostToken: meeting.hostToken,
      createdAt: meeting.createdAt,
    };
  }

  public async findByCode(code: string): Promise<MeetingLookup | null> {
    return MeetingModel.findOne({ code })
      .select({ code: 1, meetingUrl: 1, status: 1, createdAt: 1 })
      .lean<MeetingLookup>()
      .exec();
  }

  public async findHostMeetingByCode(
    code: string,
  ): Promise<HostMeetingLookup | null> {
    return MeetingModel.findOne({ code })
      .select({ code: 1, meetingUrl: 1, status: 1, createdAt: 1, hostToken: 1 })
      .lean<HostMeetingLookup>()
      .exec();
  }
}
