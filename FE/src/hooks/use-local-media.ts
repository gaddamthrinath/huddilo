"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MediaPermissionState =
  | "idle"
  | "requesting"
  | "ready"
  | "denied"
  | "unavailable";

export function useLocalMedia() {
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionState, setPermissionState] =
    useState<MediaPermissionState>("idle");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);

  const stopMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const startMedia = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState("unavailable");
      return;
    }

    setPermissionState("requesting");

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = nextStream;
      setStream(nextStream);
      setCameraEnabled(true);
      setMicrophoneEnabled(true);
      setPermissionState("ready");
    } catch (error: unknown) {
      setPermissionState(
        error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "SecurityError")
          ? "denied"
          : "unavailable",
      );
    }
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraEnabled((enabled) => {
      const nextValue = !enabled;
      streamRef.current
        ?.getVideoTracks()
        .forEach((track) => (track.enabled = nextValue));
      return nextValue;
    });
  }, []);

  const toggleMicrophone = useCallback(() => {
    setMicrophoneEnabled((enabled) => {
      const nextValue = !enabled;
      streamRef.current
        ?.getAudioTracks()
        .forEach((track) => (track.enabled = nextValue));
      return nextValue;
    });
  }, []);

  useEffect(() => stopMedia, [stopMedia]);

  return {
    stream,
    permissionState,
    cameraEnabled,
    microphoneEnabled,
    startMedia,
    toggleCamera,
    toggleMicrophone,
  };
}
