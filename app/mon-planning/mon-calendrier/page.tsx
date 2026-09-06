'use client';

import { Header } from '@/app/components/layout/Header';
import { MyCalendarView } from '@/app/components/planning/MyCalendarView';

// Wrapper espace personnel : la logique vit dans MyCalendarView (issue #93).
export default function MonCalendrierPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => {}} />
      <main className="container mx-auto max-w-2xl space-y-4 px-3 py-4 sm:px-4 sm:py-8">
        <MyCalendarView />
      </main>
    </div>
  );
}
