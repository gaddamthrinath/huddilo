import type { Metadata } from "next";

import { JoinScreen } from "@/components/join/join-screen";
import { MeetingErrorScreen } from "@/components/join/meeting-error-screen";
import { isValidMeetingCode } from "@/lib/meetings/meeting-code";

type MeetingPageProps = {
  params: Promise<{ meetingCode: string }>;
};

export const metadata: Metadata = {
  title: "Join meeting — Huddilo",
  description: "Check your camera and microphone before joining a Huddilo meeting.",
};

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { meetingCode } = await params;

  if (!isValidMeetingCode(meetingCode)) {
    return <MeetingErrorScreen title="Invalid meeting link" message="This meeting link doesn’t look right. Check the address or ask the host to share the link again." />;
  }

  return <JoinScreen meetingCode={meetingCode} />;
}
