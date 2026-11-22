"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { isMeetingDiagnosticsEnabled, recordMeetingDiagnostic } from "@/lib/media/meeting-diagnostics";
import type { RemoteMediaTrack } from "@/lib/media/meeting-media-client";

import "./live-meeting-room.css";
import { MediaDiagnosticsButton } from "./media-diagnostics-button";

export type MeetingParticipant = {
  id: string;
  displayName: string;
  role: "host" | "guest";
  access: "admitted";
};

type WaitingGuest = {
  id: string;
  displayName: string;
  role: "guest";
  access: "waiting";
};

export type CallMediaStatus =
  | { phase: "preparing" | "ready" | "recovering" }
  | { phase: "error"; message: string };

type LiveMeetingRoomProps = {
  meetingCode: string;
  selfParticipantId: string;
  participants: MeetingParticipant[];
  localStream: MediaStream | null;
  localMediaReady: boolean;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  remoteTracks: RemoteMediaTrack[];
  waitingGuests: WaitingGuest[];
  admittingGuestId: string | null;
  admissionError: string | null;
  requestingDevices: boolean;
  mediaStatus: CallMediaStatus;
  onEnableMedia: () => void;
  onReconnectMedia?: () => void;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
  onAdmitGuest: (guest: WaitingGuest) => void;
  onEndCall: () => void;
};

/** Enlarges a participant for this browser while retaining the others in a filmstrip. */
export function LiveMeetingRoom({
  meetingCode,
  selfParticipantId,
  participants,
  localStream,
  localMediaReady,
  cameraEnabled,
  microphoneEnabled,
  remoteTracks,
  waitingGuests,
  admittingGuestId,
  admissionError,
  requestingDevices,
  mediaStatus,
  onEnableMedia,
  onReconnectMedia,
  onToggleCamera,
  onToggleMicrophone,
  onAdmitGuest,
  onEndCall,
}: LiveMeetingRoomProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [showWaitingRoom, setShowWaitingRoom] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const visibleParticipants: MeetingParticipant[] = participants.length ? participants : [
    { id: selfParticipantId, displayName: "You", role: "guest", access: "admitted" },
  ];
  const focused = visibleParticipants.find((participant) => participant.id === focusedId);
  const thumbnails = focused
    ? visibleParticipants.filter((participant) => participant.id !== focused.id)
    : visibleParticipants;
  const columns = visibleParticipants.length <= 2 ? visibleParticipants.length
    : visibleParticipants.length <= 4 ? 2 : 3;
  const mobileColumns = visibleParticipants.length <= 3 ? 1 : 2;
  const statusMessage = isLeaving ? "Leaving the meeting…"
    : mediaStatus.phase === "error" ? mediaStatus.message
    : mediaStatus.phase === "recovering" ? "Restoring audio and video…"
    : mediaStatus.phase === "preparing" ? "Preparing media…"
    : "Media is ready.";

  function renderTile(participant: MeetingParticipant, expanded = false) {
    const isSelf = participant.id === selfParticipantId;
    const video = remoteTracks.find(
      (track) => track.participantId === participant.id && track.kind === "video",
    );
    const stream = isSelf
      ? (cameraEnabled && localStream?.getVideoTracks().length ? localStream : null)
      : video?.stream ?? null;

    return (
      <ParticipantTile
        key={participant.id}
        participant={participant}
        isSelf={isSelf}
        stream={stream}
        expanded={expanded}
        microphoneEnabled={isSelf
          ? Boolean(microphoneEnabled && localStream?.getAudioTracks().length)
          : remoteTracks.some((track) => track.participantId === participant.id && track.kind === "audio")}
        onSelect={() => setFocusedId(expanded ? null : participant.id)}
      />
    );
  }

  return (
    <main className="huddilo-call-room">
      {/* Audio stays mounted when switching between gallery and focus layouts. */}
      {remoteTracks.filter((track) => track.kind === "audio").map((track) => (
        <StreamAudio key={track.producerId} stream={track.stream} />
      ))}

      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-[#e4e7ec] bg-white px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="size-8 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-[#172033]">Huddilo meeting</h1>
            <p className="truncate font-mono text-xs text-[#50617e]">{meetingCode}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-sm text-[#526078] sm:inline">
            {visibleParticipants.length} {visibleParticipants.length === 1 ? "participant" : "participants"}
          </span>
          {focused && (
            <button type="button" className="huddilo-call-secondary-button" onClick={() => setFocusedId(null)}>
              Back to gallery
            </button>
          )}
          {waitingGuests.length > 0 && (
            <button type="button" className="huddilo-call-secondary-button"
              aria-expanded={showWaitingRoom} aria-controls="live-waiting-room"
              onClick={() => setShowWaitingRoom((open) => !open)}>
              Waiting ({waitingGuests.length})
            </button>
          )}
        </div>
      </header>

      <section className="huddilo-call-stage" aria-label={focused ? "Focused participant" : "Participant gallery"}
        onKeyDown={(event) => { if (event.key === "Escape") setFocusedId(null); }}>
        {focused ? (
          <div className="huddilo-call-focus-layout" data-has-thumbnails={thumbnails.length > 0}>
            {renderTile(focused, true)}
            {thumbnails.length > 0 && (
              <div className="huddilo-call-filmstrip" aria-label="Other participants">
                {thumbnails.map((participant) => renderTile(participant))}
              </div>
            )}
          </div>
        ) : (
          <div className="huddilo-call-gallery" style={{
            "--columns": columns,
            "--mobile-columns": mobileColumns,
          } as CSSProperties}>
            {thumbnails.map((participant) => renderTile(participant))}
          </div>
        )}

        {showWaitingRoom && waitingGuests.length > 0 && (
          <aside id="live-waiting-room" className="huddilo-call-waiting-room" aria-label="Waiting room">
            <h2 className="mb-3 font-semibold">Waiting room</h2>
            {admissionError && <p role="status" className="mb-3 text-sm text-[#b42318]">{admissionError}</p>}
            <ul className="space-y-2">
              {waitingGuests.map((guest) => (
                <li key={guest.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm">{guest.displayName}</span>
                  <button type="button" className="huddilo-call-secondary-button"
                    disabled={admittingGuestId !== null} onClick={() => onAdmitGuest(guest)}>
                    {admittingGuestId === guest.id ? "Admitting…" : "Admit"}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </section>

      <footer className="huddilo-call-toolbar">
        <p className={isLeaving || mediaStatus.phase === "error" || mediaStatus.phase === "recovering" ? "huddilo-call-status" : "sr-only"}
          data-error={!isLeaving && mediaStatus.phase === "error"} role="status" title={statusMessage}>
          {statusMessage}
        </p>
        <div className="huddilo-call-actions" role="group" aria-label="Call controls">
          <MediaDiagnosticsButton />
          {onReconnectMedia && !isLeaving && (
            <button type="button" className="huddilo-call-enable-button" onClick={onReconnectMedia}>Reconnect</button>
          )}
          {localMediaReady ? (
            <>
              <ControlButton label={microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
                active={microphoneEnabled} disabled={isLeaving} onClick={onToggleMicrophone} icon={<MicIcon />} />
              <ControlButton label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
                active={cameraEnabled} disabled={isLeaving} onClick={onToggleCamera} icon={<CameraIcon />} />
            </>
          ) : (
            <button type="button" onClick={onEnableMedia} className="huddilo-call-enable-button"
              disabled={requestingDevices || isLeaving}
              aria-label="Enable camera and microphone">
              <MicIcon /><CameraIcon /><span>{requestingDevices ? "Requesting…" : "Enable devices"}</span>
            </button>
          )}
          <button type="button" disabled={isLeaving} onClick={() => {
            setIsLeaving(true);
            onEndCall();
          }} className="huddilo-call-end-button"
            aria-label="Leave call" title="Leave call">
            <EndIcon />
          </button>
        </div>
      </footer>
    </main>
  );
}

function ParticipantTile({ participant, isSelf, stream, expanded, microphoneEnabled, onSelect }: {
  participant: MeetingParticipant;
  isSelf: boolean;
  stream: MediaStream | null;
  expanded: boolean;
  microphoneEnabled: boolean;
  onSelect: () => void;
}) {
  const { displayName, role } = participant;
  const initials = displayName.trim().split(/\s+/).slice(0, 2)
    .map((part) => Array.from(part)[0]).join("").toUpperCase() || "?";
  const label = isSelf && displayName !== "You" ? `${displayName} (You)` : displayName;

  return (
    <button type="button" className="huddilo-call-tile" data-focused={expanded} data-has-video={Boolean(stream)}
      aria-label={`${expanded ? "Unfocus" : "Focus"} ${label}`} aria-pressed={expanded}
      onClick={onSelect}>
      {stream ? <StreamVideo stream={stream} isLocal={isSelf} /> : (
        <span className="huddilo-call-camera-off">
          <span className="huddilo-call-avatar" aria-hidden="true">{initials}</span>
        </span>
      )}
      <span className="huddilo-call-tile-label">
        <span className="min-w-0 truncate">{label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {role === "host" && <span className="huddilo-call-host-badge">Host</span>}
          {!microphoneEnabled && (
            <span className="huddilo-call-muted" title="Microphone off">
              <MicIcon /><span aria-hidden="true" className="huddilo-call-slash" />
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function ControlButton({ label, active, disabled, onClick, icon }: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button type="button" className="huddilo-call-control" data-active={active}
      disabled={disabled} aria-label={label} title={label} onClick={onClick}>
      {icon}{!active && <span aria-hidden="true" className="huddilo-call-slash" />}
    </button>
  );
}

function StreamVideo({ stream, isLocal }: { stream: MediaStream; isLocal: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const debugEvents = isMeetingDiagnosticsEnabled() ? ["playing", "waiting", "stalled", "pause"] : [];
    function recordPlaybackEvent(event: Event) {
      recordMeetingDiagnostic("video-playback", { state: event.type, isLocal });
    }
    for (const event of debugEvents) video.addEventListener(event, recordPlaybackEvent);
    video.srcObject = stream;
    // Mobile browsers may pause playback while the meeting tab is hidden.
    function resumeVisibleVideo() {
      if (document.visibilityState === "visible" && video?.paused) {
        void video.play().catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", resumeVisibleVideo);
    return () => {
      document.removeEventListener("visibilitychange", resumeVisibleVideo);
      for (const event of debugEvents) video.removeEventListener(event, recordPlaybackEvent);
      video.srcObject = null;
    };
  }, [isLocal, stream]);
  return <video ref={videoRef} autoPlay playsInline muted className="huddilo-call-video" />;
}

function StreamAudio({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = stream;
    return () => { audio.srcObject = null; };
  }, [stream]);
  return <audio ref={audioRef} autoPlay />;
}

function MicIcon() { return <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.8" /><path d="M18 11a6 6 0 0 1-12 0M12 17v4M8 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function CameraIcon() { return <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true"><rect x="3" y="7" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="m15 10 5-3v10l-5-3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>; }
function EndIcon() { return <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true"><path d="M5 15c1.8-1.6 4.1-2.4 7-2.4s5.2.8 7 2.4v3.5a1.5 1.5 0 0 1-2.2 1.3l-2.1-1.1v-2.2H9.3v2.2l-2.1 1.1A1.5 1.5 0 0 1 5 18.5V15Z" fill="currentColor" /></svg>; }
