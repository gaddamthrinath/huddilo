import { model, Schema } from "mongoose";

export type MeetingStatus = "active" | "ended";

export type MeetingDocument = {
  code: string;
  passcode: string;
  meetingUrl: string;
  hostUrl: string;
  hostToken: string;
  status: MeetingStatus;
  createdAt: Date;
  updatedAt: Date;
};

const meetingSchema = new Schema<MeetingDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/,
    },
    passcode: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    meetingUrl: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    hostUrl: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    hostToken: {
      type: String,
      required: true,
      unique: true,
      select: false,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "ended"],
      default: "active",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const MeetingModel = model<MeetingDocument>("Meeting", meetingSchema);
