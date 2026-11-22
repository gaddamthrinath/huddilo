"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Socket } from "socket.io-client";

import { AppHeader } from "@/components/layout/app-header";
import { LiveMeetingRoom, type CallMediaStatus, type MeetingParticipant } from "@/components/meeting/live-meeting-room";
import { MediaDiagnosticsButton } from "@/components/meeting/media-diagnostics-button";
import { useLocalMedia } from "@/hooks/use-local-media";
import { ensureGuestSession, getApprovedGuestName, getHostAccess, getMeeting, MeetingApiError } from "@/lib/api/meetings";
import { MeetingMediaClient, type MediaRecoveryState, type RemoteMediaTrack } from "@/lib/media/meeting-media-client";
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
  | { success: true; participant: MeetingParticipant | WaitingGuest }
  | { success: false; error: { code: string; message: string } };

type ParticipantListResponse =
  | { success: true; participants: MeetingParticipant[] }
  | { success: false; error: { code: string; message: string } };

type JoinState = "idle" | "joining" | "reconnecting" | "waiting" | "admitted" | "error";

type WaitingGuest = {
  id: string;
  displayName: string;
  role: "guest";
  access: "waiting";
};

const DISPLAY_NAME_KEY = "huddilo-display-name";

function readSavedDisplayName(): string {
  try {
    return sessionStorage.getItem(DISPLAY_NAME_KEY)?.trim().slice(0, 50) ?? "";
  } catch {
    return "";
  }
}

export function JoinScreen({ meetingCode }: { meetingCode: string }) {
  const router = useRouter();
  const [validation, setValidation] = useState<ValidationState>({ status: "checking" });
  const [displayName, setDisplayName] = useState("");
  const [joinNotice, setJoinNotice] = useState<string | null>(null);
  const [joinState, setJoinState] = useState<JoinState>("idle");
  const [canRejoin, setCanRejoin] = useState(false);
  const [hasHostAccess, setHasHostAccess] = useState(false);
  const [role, setRole] = useState<"guest" | "host" | null>(null);
  const [waitingGuests, setWaitingGuests] = useState<WaitingGuest[]>([]);
  const [admittingGuestId, setAdmittingGuestId] = useState<string | null>(null);
  const [admissionError, setAdmissionError] = useState<string | null>(null);
  const [remoteTracks, setRemoteTracks] = useState<RemoteMediaTrack[]>([]);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [selfParticipantId, setSelfParticipantId] = useState<string | null>(null);
  const [mediaStatus, setMediaStatus] = useState<CallMediaStatus>({ phase: "preparing" });
  const [mediaRecovery, setMediaRecovery] = useState<MediaRecoveryState>("stable");
  const mediaClientRef = useRef<MeetingMediaClient | null>(null);
  const media = useLocalMedia();
  const localStreamRef = useRef<MediaStream | null>(null);
  const admissionReceived = useRef(false);
  const joinedName = useRef<string | null>(null);
  const reconnectPending = useRef(false);
  const autoMediaRejoinUsed = useRef(false);

  const resetLiveMedia = useCallback(() => {
    mediaClientRef.current?.close();
    mediaClientRef.current = null;
    setMediaRecovery("stable");
    setParticipants([]);
    setWaitingGuests([]);
    setRemoteTracks([]);
    setSelfParticipantId(null);
  }, []);

  const reconnectMeeting = useCallback(() => {
    if (!joinedName.current || reconnectPending.current) return;
    const socket = getMeetingSocket();
    // Keep the socket instance so its existing connect listener can rejoin.
    socket.disconnect();
    resetLiveMedia();
    reconnectPending.current = true;
    setJoinState("reconnecting");
    setJoinNotice("Media connection lost. Reconnecting to the meeting…");
    socket.connect();
  }, [resetLiveMedia]);

  const handleRemoteTrack = useCallback((track: RemoteMediaTrack) => {
    setRemoteTracks((currentTracks) => [
      ...currentTracks.filter((currentTrack) => currentTrack.producerId !== track.producerId),
      track,
    ]);
  }, []);

  const handleRemoteTrackRemoved = useCallback((producerId: string) => {
    setRemoteTracks((currentTracks) =>
      currentTracks.filter((currentTrack) => currentTrack.producerId !== producerId),
    );
  }, []);

  const upsertParticipant = useCallback((participant: MeetingParticipant) => {
    setParticipants((currentParticipants) => [
      ...currentParticipants.filter((currentParticipant) => currentParticipant.id !== participant.id),
      participant,
    ]);
  }, []);

  const loadAdmittedParticipants = useCallback(async () => {
    const response = await emitWithAck<ParticipantListResponse>(
      getMeetingSocket(),
      "room:list-participants",
    );
    if (!response.success) {
      throw new Error(response.error.message);
    }
    setParticipants(response.participants);
  }, []);

  const prepareMeetingMedia = useCallback(async (stream: MediaStream | null) => {
    // Admission—not camera permission—authorizes the media connection. This
    // lets users enter without devices and enable them later if they choose.
    const mediaClient = mediaClientRef.current ?? new MeetingMediaClient(getMeetingSocket(), {
      onRemoteTrack: handleRemoteTrack,
      onRemoteTrackRemoved: handleRemoteTrackRemoved,
      onRecoveryState: setMediaRecovery,
    });
    mediaClientRef.current = mediaClient;

    try {
      setMediaStatus({ phase: "preparing" });
      await mediaClient.prepare();
      if (mediaClientRef.current !== mediaClient) return;
      if (stream) {
        await mediaClient.publish(stream);
      }
      if (mediaClientRef.current !== mediaClient) return;
      setMediaStatus({ phase: "ready" });
    } catch (error: unknown) {
      if (mediaClientRef.current !== mediaClient) return;
      console.error("Huddilo media setup failed", error);
      const message = error instanceof Error
        ? `Media setup failed: ${error.message}`
        : "Media setup failed. Check the browser console and backend logs.";
      setMediaStatus({ phase: "error", message });
      setJoinNotice(
        error instanceof Error
          ? `You were admitted, but media setup failed: ${error.message}`
          : "You were admitted, but we could not prepare the media connection.",
      );
    }
  }, [handleRemoteTrack, handleRemoteTrackRemoved]);

  useEffect(() => {
    localStreamRef.current = media.stream;
  }, [media.stream]);

  const validateMeeting = useCallback((signal?: AbortSignal) => {
    return Promise.all([
      getMeeting(meetingCode, signal),
      getApprovedGuestName(meetingCode, signal).catch(() => null),
      getHostAccess(meetingCode, signal).then(() => true, () => false),
    ])
      .then(([meeting, approvedName, hostAccess]) => {
        if (signal?.aborted) return;
        const savedName = approvedName || readSavedDisplayName();
        setDisplayName((current) => current || savedName);
        setCanRejoin(Boolean(approvedName));
        setHasHostAccess(hostAccess);
        setValidation({ status: "ready", meeting });
      })
      .catch((error: unknown) => {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setValidation(validationStateFromError(error));
      });
  }, [meetingCode]);

  useEffect(() => {
    const controller = new AbortController();
    void validateMeeting(controller.signal);
    return () => controller.abort();
  }, [validateMeeting]);

  const joinConnectedSocket = useCallback(async (socket: Socket, name: string) => {
    const connectionId = socket.id;
    if (!connectionId) return;
    admissionReceived.current = false;
    try {
      const response = await emitWithAck<JoinResponse>(socket, "room:join", { meetingCode, displayName: name });
      if (socket.id !== connectionId) return;
      if (!response.success) throw new Error(response.error.message);

      setSelfParticipantId(response.participant.id);
      setRole(response.participant.role);
      if (response.participant.access === "waiting") {
        if (admissionReceived.current) return;
        setCanRejoin(false);
        setJoinState("waiting");
        setJoinNotice("Your request was sent. Waiting for the host to let you in…");
        return;
      }

      setJoinState("admitted");
      upsertParticipant(response.participant);
      void loadAdmittedParticipants().catch((error: unknown) => console.error("Could not load meeting participants", error));
      void prepareMeetingMedia(localStreamRef.current);
    } catch (error: unknown) {
      if (socket.id !== connectionId) return;
      setJoinState("error");
      setJoinNotice(error instanceof Error ? error.message : "We couldn’t join the meeting. Please try again.");
    }
  }, [meetingCode, loadAdmittedParticipants, prepareMeetingMedia, upsertParticipant]);

  useEffect(() => {
    const socket = getMeetingSocket();

    function handleAdmission(): void {
      admissionReceived.current = true;
      setCanRejoin(true);
      // The host sends this event after selecting Admit for a waiting guest.
      setJoinState("admitted");
      setJoinNotice("You have been admitted. Preparing your secure meeting connection…");
      void loadAdmittedParticipants().catch((error: unknown) => console.error("Could not load meeting participants", error));
      void prepareMeetingMedia(localStreamRef.current);
    }

    function handleGuestRequested(guest: WaitingGuest): void {
      setWaitingGuests((currentGuests) =>
        currentGuests.some((currentGuest) => currentGuest.id === guest.id)
          ? currentGuests
          : [...currentGuests, guest],
      );
    }

    function handleParticipantAdmitted(participant: MeetingParticipant): void {
      upsertParticipant(participant);
    }

    function handleParticipantLeft(participantId: string): void {
      setParticipants((current) => current.filter((participant) => participant.id !== participantId));
      setRemoteTracks((current) => current.filter((track) => track.participantId !== participantId));
    }

    function handleWaitingGuestLeft(participantId: string): void {
      setWaitingGuests((current) => current.filter((guest) => guest.id !== participantId));
    }

    function handleDisconnect(reason: string): void {
      if (reason === "io client disconnect" || !joinedName.current) return;
      resetLiveMedia();
      reconnectPending.current = socket.active;
      setJoinState(socket.active ? "reconnecting" : "error");
      setJoinNotice(socket.active ? "Connection lost. Reconnecting…" : "Connection lost. Select Join to reconnect.");
    }

    function handleReconnect(): void {
      if (!reconnectPending.current || !joinedName.current) return;
      reconnectPending.current = false;
      void joinConnectedSocket(socket, joinedName.current);
    }

    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleReconnect);
    socket.on("room:admitted", handleAdmission);
    socket.on("waiting-room:guest-requested", handleGuestRequested);
    socket.on("room:participant-admitted", handleParticipantAdmitted);
    socket.on("room:participant-left", handleParticipantLeft);
    socket.on("waiting-room:guest-left", handleWaitingGuestLeft);
    return () => {
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleReconnect);
      socket.off("room:admitted", handleAdmission);
      socket.off("waiting-room:guest-requested", handleGuestRequested);
      socket.off("room:participant-admitted", handleParticipantAdmitted);
      socket.off("room:participant-left", handleParticipantLeft);
      socket.off("waiting-room:guest-left", handleWaitingGuestLeft);
      mediaClientRef.current?.close();
      mediaClientRef.current = null;
      disconnectMeetingSocket();
    };
  }, [joinConnectedSocket, loadAdmittedParticipants, prepareMeetingMedia, resetLiveMedia, upsertParticipant]);

  useEffect(() => {
    if (joinState !== "admitted" || mediaRecovery !== "failed") return;

    function tryRejoinWhenVisible() {
      if (document.visibilityState !== "visible" || autoMediaRejoinUsed.current) return;
      autoMediaRejoinUsed.current = true;
      reconnectMeeting();
    }

    const timer = window.setTimeout(tryRejoinWhenVisible, 0);
    document.addEventListener("visibilitychange", tryRejoinWhenVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", tryRejoinWhenVisible);
    };
  }, [joinState, mediaRecovery, reconnectMeeting]);

  async function handleJoin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) return;

    try {
      sessionStorage.setItem(DISPLAY_NAME_KEY, name);
    } catch {
      // Storage is optional. The participant can still join when it is blocked.
    }
    setJoinState("joining");
    setJoinNotice("Connecting to the meeting…");

    try {
      if (!hasHostAccess) await ensureGuestSession(meetingCode);
      const socket = await connectMeetingSocket();
      joinedName.current = name;
      await joinConnectedSocket(socket, name);
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
    setAdmissionError(null);

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
      setAdmissionError(
        error instanceof Error
          ? error.message
          : "We couldn’t admit this guest. Please try again.",
      );
    } finally {
      setAdmittingGuestId(null);
    }
  }

  async function handleStartMedia(): Promise<void> {
    const stream = await media.startMedia();
    if (stream && joinState === "admitted") {
      await prepareMeetingMedia(stream);
    } else if (!stream && joinState === "admitted") {
      setMediaStatus({ phase: "error", message: "Couldn’t access your camera or microphone. Check browser permissions and try again." });
    }
  }

  function handleEndCall(): void {
    joinedName.current = null;
    reconnectPending.current = false;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaClientRef.current?.close();
    disconnectMeetingSocket();
    router.push("/");
  }

  if (validation.status === "checking") return <JoinLoadingScreen meetingCode={meetingCode} />;
  if (validation.status === "not-found") return <MeetingErrorScreen title="Meeting not found" message="We couldn’t find a meeting for this link. Check that the link was copied correctly or ask the host for a new one." />;
  if (validation.status === "ended") return <MeetingErrorScreen title="This meeting has ended" message="This meeting is no longer accepting participants. Ask the host to create a new meeting." />;
  if (validation.status === "error") return <MeetingErrorScreen title="We couldn’t open the meeting" message="Huddilo is temporarily unavailable. Check your connection and try again." onRetry={() => { setValidation({ status: "checking" }); void validateMeeting(); }} />;

  if (joinState === "admitted" && role && selfParticipantId) {
    return (
      <LiveMeetingRoom
        meetingCode={validation.meeting.code}
        selfParticipantId={selfParticipantId}
        participants={participants}
        localStream={media.stream}
        localMediaReady={media.permissionState === "ready"}
        cameraEnabled={media.cameraEnabled}
        microphoneEnabled={media.microphoneEnabled}
        mediaStatus={mediaRecovery === "stable" ? mediaStatus : mediaRecovery === "recovering"
          ? { phase: "recovering" }
          : { phase: "error", message: "Media connection lost." }}
        onReconnectMedia={mediaRecovery === "failed" ? reconnectMeeting : undefined}
        remoteTracks={remoteTracks}
        waitingGuests={waitingGuests}
        admittingGuestId={admittingGuestId}
        admissionError={admissionError}
        requestingDevices={media.permissionState === "requesting"}
        onEnableMedia={() => void handleStartMedia()}
        onToggleCamera={media.toggleCamera}
        onToggleMicrophone={media.toggleMicrophone}
        onAdmitGuest={(guest) => void handleAdmitGuest(guest)}
        onEndCall={handleEndCall}
      />
    );
  }

  const canEnterDirectly = hasHostAccess || canRejoin;
  const enterLabel = hasHostAccess ? "Join meeting" : canRejoin ? "Rejoin meeting" : "Ask to join";
  const joinLabel = {
    idle: enterLabel,
    error: enterLabel,
    joining: "Connecting…",
    reconnecting: "Reconnecting…",
    waiting: "Waiting for host",
    admitted: "Admitted",
  }[joinState];

  return (
    <div className="min-h-svh bg-[#f5f7fb] text-[#172033] lg:h-svh lg:overflow-hidden">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-[1200px] gap-7 px-5 py-8 sm:px-8 md:min-h-[calc(100svh-69px)] md:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)] md:content-center md:items-start md:gap-7 md:py-8 lg:h-[calc(100svh-68px)] lg:min-h-0 lg:gap-8 lg:px-10">
        <MediaPreview stream={media.stream} permissionState={media.permissionState} cameraEnabled={media.cameraEnabled} microphoneEnabled={media.microphoneEnabled} onStartMedia={() => void handleStartMedia()} onToggleCamera={media.toggleCamera} onToggleMicrophone={media.toggleMicrophone} />

        <section className="self-center rounded-card border border-[#dfe4ec] bg-white p-6 shadow-[0_20px_52px_rgba(26,38,68,0.09)] sm:p-7 lg:flex lg:flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#2458e6]">
              <span className="size-2 rounded-full bg-[#35a66f]" />
              Meeting is ready
            </div>
            <span className="rounded-md bg-[#f1f4f9] px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-[#667085]">{validation.meeting.code}</span>
          </div>
          <h1 className="mt-7 text-3xl font-bold tracking-[-0.04em] text-[#171b24]">Ready to join?</h1>
          <p className="mt-2 text-base leading-7 text-[#667085]">
            {canEnterDirectly ? "Check your name and devices before joining." : "Add your name and check your devices before asking to enter."}
          </p>

          <form onSubmit={(event) => void handleJoin(event)} className="mt-7">
            <label htmlFor="display-name" className="mb-2 block text-sm font-semibold text-[#344054]">Your name</label>
            <input id="display-name" name="displayName" value={displayName} onChange={(event) => { setDisplayName(event.target.value); setJoinNotice(null); }} maxLength={50} autoComplete="name" placeholder="Enter your display name" className="h-12 w-full rounded-control border border-[#cfd5df] bg-white px-3.5 text-base text-[#172033] outline-none transition-[border-color,box-shadow] placeholder:text-[#98a2b3] focus:border-[#2458e6] focus:ring-3 focus:ring-[#2458e6]/12" />
            <button type="submit" disabled={!displayName.trim() || (joinState !== "idle" && joinState !== "error")} className="mt-4 h-12 w-full rounded-control bg-[#2458e6] px-5 text-base font-semibold text-white shadow-[0_5px_14px_rgba(36,88,230,0.2)] hover:bg-[#1d49c6] disabled:cursor-not-allowed disabled:bg-[#b7c4e8] disabled:shadow-none">{joinLabel}</button>
          </form>

          {joinNotice && <p role="status" className={`mt-4 rounded-control border px-3.5 py-3 text-sm leading-6 ${joinState === "error" ? "border-[#fecdca] bg-[#fef3f2] text-[#b42318]" : joinState === "admitted" ? "border-[#abefc6] bg-[#ecfdf3] text-[#067647]" : "border-[#dbe5ff] bg-[#f3f6ff] text-[#334f9d]"}`}>{joinNotice}</p>}

          <div className="mt-3 empty:hidden"><MediaDiagnosticsButton /></div>

          {role === "host" && joinState === "admitted" && (
            <section className="mt-5 rounded-card border border-[#dfe4ec] bg-[#f8fafc] p-4" aria-label="Waiting room">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[#344054]">Waiting room</h2>
                <span className="rounded-full bg-[#e8eefc] px-2.5 py-1 text-xs font-semibold text-[#2458e6]">{waitingGuests.length}</span>
              </div>
              {waitingGuests.length === 0 ? (
                <p className="mt-3 text-sm leading-6 text-[#667085]">Guests who ask to join will appear here.</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {waitingGuests.map((guest) => (
                    <li key={guest.id} className="flex items-center justify-between gap-3 rounded-control border border-[#e4e7ec] bg-white px-3 py-2.5">
                      <span className="min-w-0 truncate text-sm font-medium text-[#344054]">{guest.displayName}</span>
                      <button type="button" onClick={() => void handleAdmitGuest(guest)} disabled={admittingGuestId === guest.id} className="h-9 shrink-0 rounded-control bg-[#2458e6] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#1d49c6] disabled:cursor-not-allowed disabled:bg-[#b7c4e8]">{admittingGuestId === guest.id ? "Admitting…" : "Admit"}</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <div className="mt-7 border-t border-[#e7e9ee] pt-5 lg:mt-auto">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-[#eef3ff] text-[#2458e6]" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" className="size-4"><path d="M10 2.5 16 5v4.2c0 3.7-2.5 6.8-6 8.3-3.5-1.5-6-4.6-6-8.3V5l6-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m7.5 10 1.6 1.6 3.5-3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
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
