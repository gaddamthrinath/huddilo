import Link from "next/link";

import { AppHeader } from "@/components/layout/app-header";

type MeetingErrorScreenProps = {
  title: string;
  message: string;
  onRetry?: () => void;
};

export function MeetingErrorScreen({ title, message, onRetry }: MeetingErrorScreenProps) {
  return (
    <div className="min-h-svh bg-[#f7f8fa] text-[#172033]">
      <AppHeader />
      <main className="mx-auto flex min-h-[calc(100svh-68px)] max-w-2xl items-center justify-center px-5 py-12">
        <section className="w-full rounded-2xl border border-[#e1e5ec] bg-white p-7 text-center shadow-[0_18px_55px_rgba(26,38,68,0.08)] sm:p-10">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#edf2ff] text-[#2458e6]">
            <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7.5v5M12 16.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-[-0.03em] text-[#171b24] sm:text-3xl">{title}</h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-7 text-[#667085]">{message}</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            {onRetry && <button type="button" onClick={onRetry} className="h-11 rounded-lg bg-[#2458e6] px-5 text-sm font-semibold text-white hover:bg-[#1d49c6]">Try again</button>}
            <Link href="/" className="inline-flex h-11 items-center justify-center rounded-lg border border-[#d5dae3] bg-white px-5 text-sm font-semibold text-[#344054] hover:bg-[#f8f9fb]">Back to home</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
