import type { Meeting, PublicMeeting } from "@/types/meeting";

type CreateMeetingResponse = {
  success: true;
  data: {
    meeting: Meeting;
  };
};

type ErrorResponse = {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
};

type GetMeetingResponse = {
  success: true;
  data: {
    meeting: PublicMeeting;
  };
};

type HostAccessResponse = {
  success: true;
  data: {
    role: "host";
    meeting: PublicMeeting;
  };
};

export class MeetingApiError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MeetingApiError";
  }
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export async function createMeeting(): Promise<Meeting> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/meetings`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new Error("The meeting service is unavailable. Please try again shortly.");
  }

  const payload = (await response.json()) as CreateMeetingResponse | ErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error(
      "error" in payload && payload.error?.message
        ? payload.error.message
        : "Unable to create the meeting. Please try again.",
    );
  }

  return payload.data.meeting;
}

export async function getMeeting(
  meetingCode: string,
  signal?: AbortSignal,
): Promise<PublicMeeting> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/meetings/${encodeURIComponent(meetingCode)}`,
      { signal },
    );
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new MeetingApiError(
      "We couldn't reach Huddilo. Check your connection and try again.",
      "SERVICE_UNAVAILABLE",
      0,
    );
  }

  const payload = (await response.json()) as GetMeetingResponse | ErrorResponse;

  if (!response.ok || !payload.success) {
    throw new MeetingApiError(
      "error" in payload && payload.error?.message
        ? payload.error.message
        : "We couldn't open this meeting.",
      "error" in payload && payload.error?.code
        ? payload.error.code
        : "UNKNOWN_ERROR",
      response.status,
    );
  }

  return payload.data.meeting;
}

export async function establishHostSession(
  meetingCode: string,
  token: string,
): Promise<PublicMeeting> {
  const response = await fetch(`${API_BASE_URL}/meetings/${encodeURIComponent(meetingCode)}/host-session`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token }),
  });

  const payload = (await response.json()) as HostAccessResponse | ErrorResponse;

  if (!response.ok || !payload.success) {
    throw new MeetingApiError(
      "error" in payload && payload.error?.message ? payload.error.message : "We couldn't verify this host link.",
      "error" in payload && payload.error?.code ? payload.error.code : "INVALID_HOST_LINK",
      response.status,
    );
  }

  return payload.data.meeting;
}

export async function getHostAccess(meetingCode: string): Promise<PublicMeeting> {
  const response = await fetch(`${API_BASE_URL}/meetings/${encodeURIComponent(meetingCode)}/host-access`, {
    credentials: "include",
  });
  const payload = (await response.json()) as HostAccessResponse | ErrorResponse;

  if (!response.ok || !payload.success) {
    throw new MeetingApiError(
      "error" in payload && payload.error?.message ? payload.error.message : "Open your private host link to continue.",
      "error" in payload && payload.error?.code ? payload.error.code : "HOST_SESSION_REQUIRED",
      response.status,
    );
  }

  return payload.data.meeting;
}
