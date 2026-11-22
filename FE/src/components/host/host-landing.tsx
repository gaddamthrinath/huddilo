"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { establishHostSession, getHostAccess, MeetingApiError } from "@/lib/api/meetings";
import type { PublicMeeting } from "@/types/meeting";

type State = "checking" | "ready" | "error";

export function HostLanding({ meetingCode, token }: { meetingCode: string; token?: string }) {
  const [state, setState] = useState<State>("checking");
  const [meeting, setMeeting] = useState<PublicMeeting | null>(null);
  const [message, setMessage] = useState("Verifying your private host link…");

  useEffect(() => {
    let cancelled = false;

    async function verify(): Promise<void> {
      try {
        const result = token
          ? await establishHostSession(meetingCode, token)
          : await getHostAccess(meetingCode);

        if (cancelled) return;
        setMeeting(result);
        setState("ready");
        if (token) window.history.replaceState(null, "", `/host/${meetingCode}`);
      } catch (error: unknown) {
        if (cancelled) return;
        setMessage(error instanceof MeetingApiError ? error.message : "We couldn't verify this host link.");
        setState("error");
      }
    }

    void verify();
    return () => { cancelled = true; };
  }, [meetingCode, token]);

  return (
    <div className="min-h-dvh bg-[#f5f7fb] text-[#1b2432]">
      <header className="border-b border-[#e3e7ef] bg-white"><div className="mx-auto flex h-[62px] max-w-[1200px] items-center px-5 sm:px-7"><Link href="/" className="flex items-center gap-2.5"><BrandMark className="size-7" /><span className="font-semibold tracking-[-0.025em]">Huddilo</span></Link></div></header>
      <main className="mx-auto flex min-h-[calc(100dvh-62px)] max-w-[720px] items-center px-5 py-10 sm:px-7">
        <section className="w-full rounded-card border border-[#dfe5ef] bg-white p-6 shadow-[0_16px_42px_rgba(34,50,84,0.08)] sm:p-9" aria-live="polite">
          {state === "checking" && <div className="flex items-center gap-3 text-[#53627d]"><span className="size-5 animate-spin rounded-full border-2 border-[#b9c8ef] border-t-[#2458e6]" /><span className="text-base font-medium">{message}</span></div>}
          {state === "error" && <><p className="text-sm font-semibold text-[#b42318]">Host access unavailable</p><h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-[#1b2432]">We couldn’t open this host link.</h1><p className="mt-3 max-w-[540px] text-base leading-7 text-[#59677f]">{message} The public meeting link lets you join as a guest, but it cannot provide host controls.</p><Link href={`/${meetingCode}`} className="mt-7 inline-flex h-11 items-center rounded-control bg-[#2458e6] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1d49c6]">Join as guest</Link></>}
          {state === "ready" && meeting && <><div className="flex items-center gap-2 text-sm font-semibold text-[#0b7a55]"><span className="size-2 rounded-full bg-[#2ab77b]" />Host access confirmed</div><h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-[#1b2432]">You’re the meeting host.</h1><p className="mt-3 max-w-[540px] text-base leading-7 text-[#59677f]">This browser can manage the waiting room for meeting <span className="font-mono font-semibold text-[#34435e]">{meeting.code}</span>. Your private token has been removed from the address bar.</p><Link href={`/${meeting.code}`} className="mt-7 inline-flex h-11 items-center rounded-control bg-[#2458e6] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1d49c6]">Continue to meeting</Link><p className="mt-5 text-sm text-[#68758c]">Keep the original host link private. Guests should only receive the public meeting link.</p></>}
        </section>
      </main>
    </div>
  );
}
