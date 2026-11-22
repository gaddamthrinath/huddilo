import { AppHeader } from "@/components/layout/app-header";
import { CreateMeetingPanel } from "@/components/meeting/create-meeting-panel";
import { MeetingPreview } from "@/components/meeting/meeting-preview";

export default function HomePage() {
  return (
    <div className="min-h-svh bg-white text-[#172033]">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-10 px-5 py-9 sm:px-8 sm:py-12 md:min-h-[calc(100svh-69px)] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center md:gap-8 md:py-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-16 lg:px-10 xl:gap-20 xl:px-12">
        <CreateMeetingPanel />
        <MeetingPreview />
      </main>
    </div>
  );
}
