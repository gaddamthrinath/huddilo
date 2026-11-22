"use client";

import { useSyncExternalStore } from "react";

import {
  downloadMeetingDiagnostics,
  isMeetingDiagnosticsEnabled,
  recordMeetingDiagnostic,
} from "@/lib/media/meeting-diagnostics";

// The query flag is read once per page load, with the button hidden during SSR.
function subscribe() {
  return () => {};
}

export function MediaDiagnosticsButton() {
  const enabled = useSyncExternalStore(subscribe, isMeetingDiagnosticsEnabled, () => false);
  if (!enabled) return null;

  return (
    <button
      type="button"
      className="rounded-control border border-[#dce4f2] bg-white px-3 py-2 text-sm font-semibold text-[#254788] hover:bg-[#f2f6ff] focus-visible:outline-2 focus-visible:outline-[#2458e6]"
      onClick={() => {
        recordMeetingDiagnostic("report-requested");
        downloadMeetingDiagnostics();
      }}
    >
      Save media report
    </button>
  );
}
