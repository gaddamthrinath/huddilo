"use client";

import { useCallback, useEffect, useState } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { useLocalMedia } from "@/hooks/use-local-media";
import { getMeeting, MeetingApiError } from "@/lib/api/meetings";
import {
  connectMeetingSocket,
  disconnectMeetingSocket,
  emitWithAck,
  getMeetingSocket,
} from "@/lib/realtime/meeting-socket";
import type { PublicMeeting } from "@/types/meeting";

import { MediaPreview } from "./media-preview";
import { MeetingErrorScreen } from "./meeting-error-screen";

type ValidationState =
  | { status: "checking" }
  | { status: "ready"; meeting: PublicMeeting }
  | { status: "not-found" }
  | { status: "ended" }
  | { status: "error" };

type JoinResponse =
  | { success: true; participant: { access: "waiting" | "admitted"; role: "guest" | "host" } }
  | { success: false; error: { code: string; message: string } };

type JoinState = "idle" | "joining" | "waiting" | "admitted" | "error";

type WaitingGuest = {
  id: string;
  displayName: string;
  role: "guest";
  access: "waiting";
};

export function JoinScreen({ meetingCode }: { meetingCode: string }) {
  const [validation, setValidation] = useState<ValidationState>({ status: "checking" });
  const [displayName, setDisplayName] = useState("");
  const [joinNotice, setJoinNotice] = useState<string | null>(null);
  const [joinState, setJoinState] = useState<JoinState>("idle");
  const [role, setRole] = useState<"guest" | "host" | null>(null);
  const [waitingGuests, setWaitingGuests] = useState<WaitingGuest[]>([]);
  const [admittingGuestId, setAdmittingGuestId] = useState<string | null>(null);
  const media = useLocalMedia();

  const validateMeeting = useCallback(async (signal?: AbortSignal) => {
    try {
      const meeting = await getMeeting(meetingCode, signal);
      setValidation({ status: "ready", meeting });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof MeetingApiError && error.code === "MEETING_NOT_FOUND") {
        setValidation({ status: "not-found" });
      } else if (error instanceof MeetingApiError && error.code === "MEETING_ENDED") {
        setValidation({ status: "ended" });
      } else {
        setValidation({ status: "error" });
      }
    }
  }, [meetingCode]);

  useEffect(() => {
    const controller = new AbortController();
    void getMeeting(meetingCode, controller.signal)
      .then((meeting) => setValidation({ status: "ready", meeting }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setValidation(validationStateFromError(error));
      });
    return () => controller.abort();
  }, [meetingCode]);

  useEffect(() => {
    const socket = getMeetingSocket();

    function handleAdmission(): void {
      setJoinState("admitted");
      setJoinNotice("You have been admitted. Preparing your secure meeting connection…");
    }

    function handleGuestRequested(guest: WaitingGuest): void {
      setWaitingGuests((currentGuests) =>
        currentGuests.some((currentGuest) => currentGuest.id === guest.id)
          ? currentGuests
          : [...currentGuests, guest],
      );
    }

    socket.on("room:admitted", handleAdmission);
    socket.on("waiting-room:guest-requested", handleGuestRequested);
    return () => {
      socket.off("room:admitted", handleAdmission);
      socket.off("waiting-room:guest-requested", handleGuestRequested);
      disconnectMeetingSocket();
    };
  }, []);

  async function handleJoin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) return;

    sessionStorage.setItem("huddilo-display-name", name);
    setJoinState("joining");
    setJoinNotice("Connecting to the meeting…");

    try {
      const socket = await connectMeetingSocket();
      const response = await emitWithAck<JoinResponse>(socket, "room:join", {
        meetingCode,
        displayName: name,
      });

      if (!response.success) {
        throw new Error(response.error.message);
      }

      if (response.participant.access === "waiting") {
        setRole("guest");
        setJoinState("waiting");
        setJoinNotice("Your request was sent. Waiting for the host to let you in…");
        return;
      }

      setJoinState("admitted");
      setRole(response.participant.role);
      setJoinNotice(
        response.participant.role === "host"
          ? "You joined as the host. Preparing your secure meeting connection…"
          : "You have been admitted. Preparing your secure meeting connection…",
      );
    } catch (error: unknown) {
      setJoinState("error");
      setJoinNotice(
        error instanceof Error
          ? error.message
          : "We couldn’t connect you to the meeting. Please try again.",
      );
    }
  }

  async function handleAdmitGuest(guest: WaitingGuest): Promise<void> {
    setAdmittingGuestId(guest.id);

    try {
      const response = await emitWithAck<JoinResponse>(
        getMeetingSocket(),
        "room:admit",
        guest.id,
      );
      if (!response.success) {
        throw new Error(response.error.message);
      }

      setWaitingGuests((currentGuests) =>
        currentGuests.filter((currentGuest) => currentGuest.id !== guest.id),
      );
    } catch (error: unknown) {
      setJoinState("error");
      setJoinNotice(
        error instanceof Error
          ? error.message
          : "We couldn’t admit this guest. Please try again.",
      );
    } finally {
      setAdmittingGuestId(null);
    }
  }

  if (validation.status === "checking") return <JoinLoadingScreen meetingCode={meetingCode} />;
  if (validation.status === "not-found") return <MeetingErrorScreen title="Meeting not found" message="We couldn’t find a meeting for this link. Check that the link was copied correctly or ask the host for a new one." />;
  if (validation.status === "ended") return <MeetingErrorScreen title="This meeting has ended" message="This meeting is no longer accepting participants. Ask the host to create a new meeting." />;
  if (validation.status === "error") return <MeetingErrorScreen title="We couldn’t open the meeting" message="Huddilo is temporarily unavailable. Check your connection and try again." onRetry={() => { setValidation({ status: "checking" }); void validateMeeting(); }} />;

  return (
    <div className="min-h-svh bg-[#f5f7fb] text-[#172033] lg:h-svh lg:overflow-hidden">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-[1200px] gap-7 px-5 py-8 sm:px-8 md:min-h-[calc(100svh-69px)] md:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)] md:content-center md:items-start md:gap-7 md:py-8 lg:h-[calc(100svh-68px)] lg:min-h-0 lg:gap-8 lg:px-10">
        <MediaPreview stream={media.stream} permissionState={media.permissionState} cameraEnabled={media.cameraEnabled} microphoneEnabled={media.microphoneEnabled} onStartMedia={() => void media.startMedia()} onToggleCamera={media.toggleCamera} onToggleMicrophone={media.toggleMicrophone} />

        <section className="self-center rounded-2xl border border-[#dfe4ec] bg-white p-6 shadow-[0_20px_52px_rgba(26,38,68,0.09)] sm:p-7 lg:flex lg:flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#2458e6]">
              <span className="size-2 rounded-full bg-[#35a66f]" />
              Meeting is ready
            </div>
            <span className="rounded-md bg-[#f1f4f9] px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-[#667085]">{validation.meeting.code}</span>
          </div>
          <h1 className="mt-7 text-3xl font-bold tracking-[-0.04em] text-[#171b24]">Ready to join?</h1>
          <p className="mt-2 text-base leading-7 text-[#667085]">Add your name and check your devices before asking to enter.</p>

          <form onSubmit={(event) => void handleJoin(event)} className="mt-7">
            <label htmlFor="display-name" className="mb-2 block text-sm font-semibold text-[#344054]">Your name</label>
            <input id="display-name" name="displayName" value={displayName} onChange={(event) => { setDisplayName(event.target.value); setJoinNotice(null); }} maxLength={50} autoComplete="name" placeholder="Enter your display name" className="h-12 w-full rounded-lg border border-[#cfd5df] bg-white px-3.5 text-base text-[#172033] outline-none transition-[border-color,box-shadow] placeholder:text-[#98a2b3] focus:border-[#2458e6] focus:ring-3 focus:ring-[#2458e6]/12" />
            <button type="submit" disabled={!displayName.trim() || joinState === "joining" || joinState === "waiting" || joinState === "admitted"} className="mt-4 h-12 w-full rounded-lg bg-[#2458e6] px-5 text-base font-semibold text-white shadow-[0_5px_14px_rgba(36,88,230,0.2)] hover:bg-[#1d49c6] disabled:cursor-not-allowed disabled:bg-[#b7c4e8] disabled:shadow-none">{joinState === "joining" ? "Connecting…" : joinState === "waiting" ? "Waiting for host" : joinState === "admitted" ? "Admitted" : "Ask to join"}</button>
          </form>

          {joinNotice && <p role="status" className={`mt-4 rounded-lg border px-3.5 py-3 text-sm leading-6 ${joinState === "error" ? "border-[#fecdca] bg-[#fef3f2] text-[#b42318]" : joinState === "admitted" ? "border-[#abefc6] bg-[#ecfdf3] text-[#067647]" : "border-[#dbe5ff] bg-[#f3f6ff] text-[#334f9d]"}`}>{joinNotice}</p>}

          {role === "host" && joinState === "admitted" && (
            <section className="mt-5 rounded-xl border border-[#dfe4ec] bg-[#f8fafc] p-4" aria-label="Waiting room">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[#344054]">Waiting room</h2>
                <span className="rounded-full bg-[#e8eefc] px-2.5 py-1 text-xs font-semibold text-[#2458e6]">{waitingGuests.length}</span>
              </div>
              {waitingGuests.length === 0 ? (
                <p className="mt-3 text-sm leading-6 text-[#667085]">Guests who ask to join will appear here.</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {waitingGuests.map((guest) => (
                    <li key={guest.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#e4e7ec] bg-white px-3 py-2.5">
                      <span className="min-w-0 truncate text-sm font-medium text-[#344054]">{guest.displayName}</span>
                      <button type="button" onClick={() => void handleAdmitGuest(guest)} disabled={admittingGuestId === guest.id} className="h-9 shrink-0 rounded-lg bg-[#2458e6] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#1d49c6] disabled:cursor-not-allowed disabled:bg-[#b7c4e8]">{admittingGuestId === guest.id ? "Admitting…" : "Admit"}</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <div className="mt-7 border-t border-[#e7e9ee] pt-5 lg:mt-auto">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#eef3ff] text-[#2458e6]" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" className="size-4"><path d="M10 2.5 16 5v4.2c0 3.7-2.5 6.8-6 8.3-3.5-1.5-6-4.6-6-8.3V5l6-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m7.5 10 1.6 1.6 3.5-3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              <p className="text-sm leading-6 text-[#667085]"><span className="font-semibold text-[#344054]">Private by default.</span> Your camera and microphone are not shared until you join.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function validationStateFromError(error: unknown): ValidationState {
  if (error instanceof MeetingApiError && error.code === "MEETING_NOT_FOUND") {
    return { status: "not-found" };
  }
  if (error instanceof MeetingApiError && error.code === "MEETING_ENDED") {
    return { status: "ended" };
  }
  return { status: "error" };
}

function JoinLoadingScreen({ meetingCode }: { meetingCode: string }) {
  return (
    <div className="min-h-svh bg-[#f7f8fa]">
      <AppHeader />
      <main className="flex min-h-[calc(100svh-68px)] items-center justify-center px-5">
        <div className="text-center">
          <span className="mx-auto block size-9 animate-spin rounded-full border-3 border-[#dbe3f8] border-t-[#2458e6]" />
          <p className="mt-5 text-base font-semibold text-[#344054]">Checking meeting</p>
          <p className="mt-1 font-mono text-sm text-[#98a2b3]">{meetingCode}</p>
        </div>
      </main>
    </div>
  );
}
