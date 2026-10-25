"use client";

import { TheaterProvider } from "./_context/TheaterContext";
import { PreviewModal } from "./_components/PreviewModal";
import { TheaterHeader } from "./_components/theater/TheaterHeader";
import { TheaterToolbar } from "./_components/theater/TheaterToolbar";
import { TheaterFeedback } from "./_components/theater/TheaterFeedback";
import { ScheduleControls } from "./_components/theater/ScheduleControls";
import { ScheduleView } from "./_components/theater/ScheduleView";

export default function Home() {
  return (
    <TheaterProvider>
      <main className="min-h-screen bg-gradient-to-b from-[#1a0b2e] to-[#0f0720]">
        <div className="container mx-auto px-4 py-8">
          <TheaterHeader />
          <ScheduleControls>
            <TheaterToolbar />
            <TheaterFeedback />
            <ScheduleView />
          </ScheduleControls>
          <p className="mt-4 text-xs text-gray-500">
            Changes are shared with everyone using this demo. Choosing a demo
            user is not a secure sign-in. Date filters include the full selected
            days in UTC.
          </p>
          <PreviewModal />
        </div>
      </main>
    </TheaterProvider>
  );
}
