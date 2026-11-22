import { BrandMark } from "@/components/brand/brand-mark";
import Link from "next/link";

export function AppHeader() {
  return (
    <header className="border-b border-[#e4e7ec] bg-white/95 shadow-[0_2px_10px_rgba(16,24,40,0.04)]">
      <div className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-10 xl:px-12">
        <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2458e6]" aria-label="Huddilo home">
          <BrandMark className="size-8" />
          <span className="text-lg font-bold tracking-[-0.03em] text-[#111827]">Huddi<span className="text-[#2458e6]">lo</span></span>
        </Link>
        <div className="flex items-center gap-2 text-sm font-medium text-[#526078]">
          <span className="hidden sm:inline">Private meetings. Simple access.</span>
          <span className="flex size-8 items-center justify-center rounded-full border border-[#dce4ff] bg-[#f6f8ff] text-[#2458e6]" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" className="size-4"><path d="M10 2.5 16 5v4.2c0 3.7-2.5 6.8-6 8.3-3.5-1.5-6-4.6-6-8.3V5l6-2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="m7.5 10 1.6 1.6 3.5-3.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </div>
      </div>
    </header>
  );
}
