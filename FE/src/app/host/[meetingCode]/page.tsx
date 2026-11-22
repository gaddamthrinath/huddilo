import type { Metadata } from "next";

import { HostLanding } from "@/components/host/host-landing";
import { MeetingErrorScreen } from "@/components/join/meeting-error-screen";
import { isValidMeetingCode } from "@/lib/meetings/meeting-code";

type HostPageProps = {
  params: Promise<{ meetingCode: string }>;
  searchParams: Promise<{ token?: string }>;
};

export const metadata: Metadata = {
  title: "Host meeting — Huddilo",
  description: "Open your private Huddilo host meeting link.",
};

// The private token is URL-specific and must be evaluated only for the request.
export const instant = false;

export default async function HostPage({ params, searchParams }: HostPageProps) {
  const { meetingCode } = await params;
  const { token } = await searchParams;

  if (!isValidMeetingCode(meetingCode)) {
    return <MeetingErrorScreen title="Invalid host link" message="This host link doesn’t look right. Check the address or create a new meeting." />;
  }

  return <HostLanding meetingCode={meetingCode} token={token} />;
}
