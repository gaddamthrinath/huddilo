"use client";

import { useEffect, useRef } from "react";

import type { MediaPermissionState } from "@/hooks/use-local-media";

type MediaPreviewProps = {
  stream: MediaStream | null;
  permissionState: MediaPermissionState;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  onStartMedia: () => void;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
};

export function MediaPreview({
  stream,
  permissionState,
  cameraEnabled,
  microphoneEnabled,
  onStartMedia,
  onToggleCamera,
  onToggleMicrophone,
}: MediaPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <section className="overflow-hidden rounded-card border border-[#dfe4ec] bg-white shadow-[0_20px_52px_rgba(26,38,68,0.09)]">
      <div className="flex items-center justify-between border-b border-[#e8ebf0] px-5 py-4 sm:px-6">
        <div>
          <p className="text-sm font-semibold text-[#263247]">Your preview</p>
          <p className="mt-0.5 text-sm text-[#7b8494]">You&apos;re the only one who can see this.</p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-full bg-[#eef3ff] text-[#2458e6]" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" className="size-4"><path d="M10 2.5 16 5v4.2c0 3.7-2.5 6.8-6 8.3-3.5-1.5-6-4.6-6-8.3V5l6-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m7.5 10 1.6 1.6 3.5-3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>

      <div className="relative aspect-[16/10] overflow-hidden bg-[#172033] sm:aspect-video">
        {stream && cameraEnabled ? (
          <video ref={videoRef} autoPlay muted playsInline className="size-full object-contain [transform:scaleX(-1)]" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center px-6 text-center text-white">
            <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-white/10">
              <CameraOffIcon />
            </span>
            <p className="text-base font-semibold">
              {permissionState === "denied"
                ? "Camera and microphone access is blocked"
                : permissionState === "unavailable"
                  ? "No camera or microphone is available"
                  : cameraEnabled
                    ? "Check your camera and microphone"
                    : "Your camera is off"}
            </p>
            {permissionState === "idle" && (
              <button type="button" onClick={onStartMedia} className="mt-4 rounded-control bg-white px-4 py-2.5 text-sm font-semibold text-[#172033] transition-colors hover:bg-[#eef2f8] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white">
                Enable camera and microphone
              </button>
            )}
            {permissionState === "requesting" && <p className="mt-2 text-sm text-white/65">Waiting for browser permission…</p>}
            {permissionState === "denied" && <p className="mt-2 max-w-sm text-sm leading-6 text-white/65">Allow access in your browser settings, then reload this page.</p>}
          </div>
        )}

        {permissionState === "ready" && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
            <ControlButton label={microphoneEnabled ? "Mute microphone" : "Unmute microphone"} active={microphoneEnabled} onClick={onToggleMicrophone}><MicrophoneIcon muted={!microphoneEnabled} /></ControlButton>
            <ControlButton label={cameraEnabled ? "Turn camera off" : "Turn camera on"} active={cameraEnabled} onClick={onToggleCamera}>{cameraEnabled ? <CameraIcon /> : <CameraOffIcon />}</ControlButton>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-4 text-sm font-medium text-[#667085]">
          <span className="inline-flex items-center gap-2"><span className={`size-2 rounded-full ${microphoneEnabled && permissionState === "ready" ? "bg-[#35a66f]" : "bg-[#a7afbd]"}`} />{microphoneEnabled && permissionState === "ready" ? "Microphone on" : "Microphone off"}</span>
          <span className="inline-flex items-center gap-2"><span className={`size-2 rounded-full ${cameraEnabled && permissionState === "ready" ? "bg-[#35a66f]" : "bg-[#a7afbd]"}`} />{cameraEnabled && permissionState === "ready" ? "Camera on" : "Camera off"}</span>
        </div>
        <span className="text-xs font-medium text-[#98a2b3]">Not shared until you join</span>
      </div>
    </section>
  );
}

function ControlButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} className={`flex size-11 items-center justify-center rounded-control border text-white shadow-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white ${active ? "border-white/15 bg-[#303a4e] hover:bg-[#3d485e]" : "border-[#d84c4c] bg-[#d84c4c] hover:bg-[#c33e3e]"}`}>{children}</button>;
}

function MicrophoneIcon({ muted }: { muted: boolean }) {
  return muted ? <svg viewBox="0 0 20 20" fill="none" className="size-5"><path d="M5.5 8.5V9a4.5 4.5 0 0 0 8 2.8M10 13.5V16M7.8 16h4.4M3 3l14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg> : <svg viewBox="0 0 20 20" fill="none" className="size-5"><rect x="7.4" y="2.5" width="5.2" height="10" rx="2.6" stroke="currentColor" strokeWidth="1.6" /><path d="M5.5 8.5V9a4.5 4.5 0 0 0 9 0v-.5M10 13.5V16M7.8 16h4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function CameraIcon() {
  return <svg viewBox="0 0 20 20" fill="none" className="size-5"><rect x="2.5" y="5" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="m13.5 8 4-2v8l-4-2V8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}

function CameraOffIcon() {
  return <svg viewBox="0 0 20 20" fill="none" className="size-6"><path d="M4.5 5h7A2.5 2.5 0 0 1 14 7.5V12M11.5 15h-7A2.5 2.5 0 0 1 2 12.5v-5c0-.5.15-.96.4-1.35M14 8l4-2v8l-2.2-1.1M2.5 2.5l15 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
