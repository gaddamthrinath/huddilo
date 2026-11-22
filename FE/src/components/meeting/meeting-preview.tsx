function MicIcon({ muted = false }: { muted?: boolean }) {
  return muted ? (
    <svg viewBox="0 0 18 18" fill="none" className="size-3.5" aria-hidden="true">
      <path d="M5 7.5V8a4 4 0 0 0 7.1 2.5M9 12v3M7 15h4M2.5 2.5l13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 18 18" fill="none" className="size-3.5" aria-hidden="true">
      <rect x="6.5" y="2.5" width="5" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.8 8.2A4.2 4.2 0 0 0 9 12.4a4.2 4.2 0 0 0 4.2-4.2M9 12.5V15M7 15h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CallControl({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <span className={`flex size-8 items-center justify-center rounded-full ${danger ? "bg-[#e24d4d] text-white" : "bg-[#3a414d] text-white/90"}`}>
      {children}
    </span>
  );
}

export function MeetingPreview() {
  return (
    <section className="relative mx-auto min-h-[330px] w-full max-w-[650px] sm:min-h-[390px] md:mx-0 md:min-h-[390px] lg:min-h-[480px] xl:min-h-[500px]" aria-label="Huddilo meeting preview">
      <div className="absolute inset-[7%_3%_2%_3%] rounded-[48%] bg-[#edf3ff] blur-3xl" aria-hidden="true" />

      <div className="absolute left-0 top-[20%] z-10 w-[84%] overflow-hidden rounded-xl border border-[#d8dde7] bg-[#171b24] shadow-[0_22px_50px_rgba(24,35,58,0.18)] sm:left-[2%] sm:w-[82%] sm:rounded-2xl md:left-0 md:w-[84%] lg:left-[2%] lg:w-[82%] lg:shadow-[0_28px_65px_rgba(24,35,58,0.2)]">
        <div className="relative aspect-[1.52] overflow-hidden bg-[#354159]">
          <div className="absolute inset-0 meeting-grid" aria-hidden="true" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-[#c9d6f6] text-xl font-bold text-[#304873] shadow-[0_14px_30px_rgba(0,0,0,0.22)] sm:size-24 sm:text-2xl lg:size-28 lg:text-3xl">AL</div>
          </div>
          <div className="absolute bottom-4 left-4 rounded-md bg-black/45 px-2.5 py-1.5 text-xs font-medium text-white">Alex · You</div>
          <div className="absolute right-4 top-4 flex size-7 items-center justify-center rounded-full bg-black/35 text-white"><MicIcon /></div>
        </div>

        <div className="flex h-12 items-center justify-between bg-[#242a34] px-3 sm:h-14 sm:px-4">
          <span className="hidden text-xs font-medium text-white/55 sm:inline">Team weekly</span>
          <div className="flex gap-1.5 sm:gap-2">
            <CallControl><MicIcon /></CallControl>
            <CallControl><svg viewBox="0 0 18 18" fill="none" className="size-3.5" aria-hidden="true"><rect x="2.5" y="4.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="m11.5 7 4-2v8l-4-2V7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg></CallControl>
            <CallControl><svg viewBox="0 0 18 18" fill="none" className="size-3.5" aria-hidden="true"><rect x="2.5" y="3" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M6.5 15h5M9 12v3M6.5 8.5 9 6l2.5 2.5M9 6v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg></CallControl>
            <CallControl danger><svg viewBox="0 0 18 18" fill="none" className="size-3.5" aria-hidden="true"><path d="M4 10.5c3.2-1.8 6.8-1.8 10 0M5.5 9.8 4.3 12.5M13.7 12.5l-1.2-2.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></CallControl>
          </div>
          <span className="hidden text-xs font-medium text-white/45 sm:inline">4 people</span>
        </div>
      </div>

      <div className="absolute right-[1%] top-[3%] z-20 w-[34%] overflow-hidden rounded-xl border-2 border-[#2458e6] bg-[#292f3b] shadow-[0_18px_38px_rgba(36,88,230,0.2)] sm:right-[3%] md:right-0 md:w-[36%] lg:right-[3%] lg:w-[34%]">
        <div className="relative aspect-[0.95] flex items-center justify-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[#d9e3ff] text-sm font-bold text-[#2448a7] sm:size-14 lg:size-16">MK</div>
          <span className="absolute bottom-2 left-2 text-[0.7rem] font-medium text-white/90 sm:text-xs">Maya</span>
          <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/30 text-white"><MicIcon /></span>
        </div>
      </div>

      <div className="absolute bottom-[3%] right-[2%] z-20 w-[31%] overflow-hidden rounded-xl border border-[#d8dde7] bg-[#292f3b] shadow-[0_18px_38px_rgba(24,35,58,0.15)] sm:right-[5%] md:right-0 md:w-[33%] lg:right-[5%] lg:w-[31%]">
        <div className="relative aspect-[0.95] flex items-center justify-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[#dff2ea] text-sm font-bold text-[#267052] sm:size-14 lg:size-16">JD</div>
          <span className="absolute bottom-2 left-2 text-[0.7rem] font-medium text-white/90 sm:text-xs">Jon</span>
          <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/30 text-white/70"><MicIcon muted /></span>
        </div>
      </div>

      <div className="absolute bottom-[5%] left-[3%] z-30 hidden items-center gap-2.5 rounded-xl border border-[#dfe4ec] bg-white px-3.5 py-3 shadow-[0_14px_30px_rgba(32,45,70,0.13)] lg:flex">
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#eaf0ff] text-[#2458e6]">
          <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true"><path d="M10 2.5 16 5v4.2c0 3.7-2.5 6.8-6 8.3-3.5-1.5-6-4.6-6-8.3V5l6-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m7.5 10 1.6 1.6 3.5-3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span><span className="block text-xs font-semibold text-[#263247]">Meeting protected</span><span className="mt-0.5 block text-xs text-[#7b8494]">Passcode required</span></span>
      </div>
    </section>
  );
}
