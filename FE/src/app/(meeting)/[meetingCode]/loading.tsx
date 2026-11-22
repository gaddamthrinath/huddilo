import { AppHeader } from "@/components/layout/app-header";

export default function MeetingLoading() {
  return (
    <div className="min-h-svh bg-[#f7f8fa]">
      <AppHeader />
      <main className="flex min-h-[calc(100svh-68px)] items-center justify-center">
        <span className="size-9 animate-spin rounded-full border-3 border-[#dbe3f8] border-t-[#2458e6]" aria-label="Loading meeting" />
      </main>
    </div>
  );
}
