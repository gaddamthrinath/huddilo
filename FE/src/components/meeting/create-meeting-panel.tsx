"use client";

import { useState } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { createMeeting } from "@/lib/api/meetings";
import type { Meeting } from "@/types/meeting";

export function CreateMeetingPanel() {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateMeeting(): Promise<void> {
    setIsCreating(true);
    setError(null);
    setCopied(false);

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

  async function handleCopyLink(link: string): Promise<void> {

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("The link could not be copied. Please copy it manually.");
    }
  }

  return (
    <section className="mx-auto w-full max-w-[560px] md:mx-0" aria-labelledby="home-heading">
      <div className="mb-6 flex items-center gap-2.5 lg:mb-7">
        <BrandMark className="size-7 lg:size-8" />
        <span className="text-lg font-semibold tracking-[-0.025em] text-[#222936] lg:text-xl">Huddilo Meet</span>
      </div>

      <h1 id="home-heading" className="max-w-[550px] text-[2.55rem] font-bold leading-[1.08] tracking-[-0.045em] text-[#171b24] sm:text-[3rem] md:text-[2.8rem] lg:text-[3.65rem] xl:text-[3.9rem]">Meetings that move work forward.</h1>

      <p className="mt-5 max-w-[520px] text-base leading-7 text-[#5c667a] sm:text-lg lg:mt-6 lg:text-xl lg:leading-8">Bring everyone together with secure video calls, screen sharing, and collaboration built into one place.</p>

      <div className="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center md:flex-col md:items-start lg:mt-8 lg:flex-row lg:items-center lg:gap-5">
        <button type="button" onClick={handleCreateMeeting} disabled={isCreating} className="group inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#2458e6] px-5 text-base font-semibold text-white shadow-[0_4px_12px_rgba(36,88,230,0.2)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-[#1d49c6] hover:shadow-[0_6px_16px_rgba(36,88,230,0.26)] active:translate-y-px disabled:cursor-wait disabled:bg-[#6d8de5] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2458e6]">
          {isCreating ? (
            <span className="size-[18px] animate-spin rounded-full border-2 border-white/45 border-t-white" aria-hidden="true" />
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-[18px]"><rect x="3.5" y="6" width="11.5" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" /><path d="m15 10 5.5-3v10L15 14v-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
          )}
          {isCreating ? "Creating meeting…" : "Create a meeting"}
        </button>

        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#667085]">
          <ShieldIcon />
          Link and passcode included
        </span>
      </div>

      {meeting && (
        <div className="mt-5 max-w-[520px] rounded-xl border border-[#d9e1f5] bg-[#f8faff] p-3.5" aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-[#283347]">Your meeting is ready</span>
            <span className="font-mono text-xs font-semibold tracking-wide text-[#62708a]">{meeting.passcode}</span>
          </div>
          <p className="mb-3 text-sm leading-5 text-[#667085]">Share the guest link. Keep your host link private.</p>
          <MeetingLinkRow label="Guest link" link={meeting.url} onCopy={handleCopyLink} copied={copied} />
          <div className="mt-2">
            <MeetingLinkRow label="Private host link" link={meeting.hostUrl} onCopy={handleCopyLink} copied={copied} isPrivate />
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm font-medium text-[#b42318]" role="alert">{error}</p>}

      <div className="mt-10 grid grid-cols-[auto_1px_1fr] items-center gap-4 border-t border-[#e7e9ee] pt-5 text-sm text-[#667085] sm:gap-6 md:mt-8 md:grid-cols-1 md:items-start md:gap-2 md:border-t-0 md:pt-0 lg:mt-10 lg:grid-cols-[auto_1px_1fr] lg:items-center lg:gap-5 lg:border-t lg:pt-5">
        <span className="font-semibold text-[#283347]">No account needed</span>
        <span className="h-4 w-px bg-[#d6dae2] md:hidden lg:block" aria-hidden="true" />
        <span>Guests join from any browser</span>
      </div>
    </section>
  );
}

function MeetingLinkRow({ label, link, onCopy, copied, isPrivate = false }: { label: string; link: string; onCopy: (link: string) => Promise<void>; copied: boolean; isPrivate?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${isPrivate ? "border-[#efdca4] bg-[#fffdf5]" : "border-[#dfe4ee] bg-white"}`}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className={`text-xs font-semibold ${isPrivate ? "text-[#855d00]" : "text-[#50617e]"}`}>{label}</span>
        {isPrivate && <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9b6b00]">Do not share</span>}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#33415c]" title={link}>{link}</span>
        <button type="button" onClick={() => void onCopy(link)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[#edf2ff] px-3 text-sm font-semibold text-[#2458e6] transition-colors hover:bg-[#dfe8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2458e6]" aria-label={`Copy ${label.toLowerCase()}`}>
          <CopyIcon />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
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
