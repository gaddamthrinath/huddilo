"use client";

import { useEffect, useRef, useState } from "react";

import { createMeeting } from "@/lib/api/meetings";
import type { Meeting } from "@/types/meeting";

type MeetingLink = "guest" | "host";

export function CreateMeetingPanel() {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<{
    kind: MeetingLink;
    status: "copied" | "failed";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const copyAttempt = useRef(0);

  useEffect(() => {
    if (meeting) resultHeading.current?.focus();
  }, [meeting]);

  useEffect(() => {
    if (copyFeedback?.status !== "copied") return;
    const timeout = window.setTimeout(() => setCopyFeedback(null), 2_000);
    return () => window.clearTimeout(timeout);
  }, [copyFeedback]);

  async function handleCreateMeeting(): Promise<void> {
    setIsCreating(true);
    setError(null);
    copyAttempt.current += 1;
    setCopyFeedback(null);

    try {
      setMeeting(await createMeeting());
    } catch (creationError: unknown) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : "Unable to create the meeting. Please try again.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCopyLink(kind: MeetingLink, link: string): Promise<void> {
    const attempt = ++copyAttempt.current;
    try {
      await navigator.clipboard.writeText(link);
      if (attempt === copyAttempt.current) setCopyFeedback({ kind, status: "copied" });
    } catch {
      if (attempt === copyAttempt.current) setCopyFeedback({ kind, status: "failed" });
    }
  }

  return (
    <section className="mx-auto w-full max-w-[560px] md:mx-0" aria-labelledby="home-heading">
      {meeting ? (
        <div className="max-w-[520px] rounded-card border border-[#dde5f1] bg-white shadow-[0_8px_24px_rgba(23,42,84,0.06)]">
          <div className="border-b border-[#e7edf7] px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-control bg-[#eaf0ff] text-[#2458e6]" aria-hidden="true">
                <CheckIcon />
              </span>
              <h1 ref={resultHeading} tabIndex={-1} id="home-heading" className="text-xl font-bold tracking-tight text-[#172033] sm:text-2xl">
                Your meeting is ready
              </h1>
            </div>
            <p className="mt-2 pl-11 text-sm text-[#50617e]">
              Passcode <span className="ml-1 font-mono font-semibold text-[#263b60]">{meeting.passcode}</span>
            </p>
          </div>
          <div className="divide-y divide-[#e8edf5] px-4 sm:px-5">
            <MeetingLinkRow label="Guest link" link={meeting.url} onCopy={() => void handleCopyLink("guest", meeting.url)} copied={copyFeedback?.kind === "guest" && copyFeedback.status === "copied"} />
            <MeetingLinkRow label="Private host link" link={meeting.hostUrl} onCopy={() => void handleCopyLink("host", meeting.hostUrl)} copied={copyFeedback?.kind === "host" && copyFeedback.status === "copied"} isPrivate />
          </div>
          <p className={copyFeedback?.status === "failed" ? "px-4 pb-4 text-sm text-[#b42318] sm:px-5" : "sr-only"} role="status">
            {copyFeedback?.status === "copied" && (copyFeedback.kind === "guest" ? "Guest link copied." : "Private host link copied.")}
            {copyFeedback?.status === "failed" && "Couldn’t copy the link. Select the link text to copy it manually."}
          </p>
        </div>
      ) : (
        <>
          <h1 id="home-heading" className="max-w-[550px] text-[2.55rem] font-bold leading-[1.08] tracking-[-0.045em] text-[#171b24] sm:text-[3rem] md:text-[2.8rem] lg:text-[3.65rem] xl:text-[3.9rem]">Meetings that move work forward.</h1>
          <p className="mt-5 max-w-[520px] text-base leading-7 text-[#5c667a] sm:text-lg lg:mt-6 lg:text-xl lg:leading-8">Bring everyone together with secure video calls, screen sharing, and collaboration built into one place.</p>
        </>
      )}

      <div className={meeting ? "mt-4" : "mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center md:flex-col md:items-start lg:mt-8 lg:flex-row lg:items-center lg:gap-5"}>
        <button type="button" onClick={handleCreateMeeting} disabled={isCreating} className={`inline-flex h-11 items-center justify-center gap-2 rounded-control px-5 font-semibold transition-colors disabled:cursor-wait disabled:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2458e6] ${meeting ? "border border-[#dce4f2] bg-white text-sm text-[#254788] hover:bg-[#f2f6ff]" : "bg-[#2458e6] text-base text-white shadow-[0_4px_12px_rgba(36,88,230,0.2)] hover:bg-[#1d49c6]"}`}>
          {isCreating ? (
            <span className="size-[18px] animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-[18px]"><rect x="3.5" y="6" width="11.5" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" /><path d="m15 10 5.5-3v10L15 14v-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
          )}
          {isCreating ? "Creating meeting…" : meeting ? "Create another meeting" : "Create a meeting"}
        </button>

        {!meeting && <span className="inline-flex items-center gap-2 text-sm font-medium text-[#667085]">
          <ShieldIcon />
          Link and passcode included
        </span>}
      </div>

      {error && <p className="mt-4 text-sm font-medium text-[#b42318]" role="alert">{error}</p>}

    </section>
  );
}

function MeetingLinkRow({ label, link, onCopy, copied, isPrivate = false }: { label: string; link: string; onCopy: () => void; copied: boolean; isPrivate?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-[#172033]">
          {isPrivate && (
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4 shrink-0 text-[#50617e]">
              <path d="M6.5 8V6.5a3.5 3.5 0 1 1 7 0V8" stroke="currentColor" strokeWidth="1.5" />
              <rect x="4.5" y="8" width="11" height="8.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
          <span>{label}</span>
        </div>
        <p className="mt-0.5 truncate text-sm text-[#566780]" title={link}>{link}</p>
        {isPrivate && <p className="mt-1 text-xs font-semibold text-[#80571b]">Keep this link private.</p>}
      </div>
      <button type="button" onClick={onCopy} className={`inline-flex h-11 w-22 shrink-0 items-center justify-center gap-1.5 rounded-control border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2458e6] ${copied ? "border-[#c1ead3] bg-[#eaf8f0] text-[#17663c]" : isPrivate ? "border-[#dce4f2] bg-white text-[#254788] hover:bg-[#f2f6ff]" : "border-[#2458e6] bg-[#2458e6] text-white hover:bg-[#1d49c6]"}`} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4.5 text-[#2458e6]"><path d="M10 2.5 16 5v4.2c0 3.7-2.5 6.8-6 8.3-3.5-1.5-6-4.6-6-8.3V5l6-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m7.5 10 1.6 1.6 3.5-3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" fill="none" className="size-4"><rect x="6.25" y="5.25" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M11.75 5.25V4.5A1.5 1.5 0 0 0 10.25 3h-5.5a1.5 1.5 0 0 0-1.5 1.5V10a1.5 1.5 0 0 0 1.5 1.5h1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
  );
}
