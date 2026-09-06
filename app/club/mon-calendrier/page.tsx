'use client';

import { MyCalendarView } from '@/app/components/planning/MyCalendarView';

// Wrapper espace club : la logique vit dans MyCalendarView (issue #93).
export default function MonCalendrierPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <MyCalendarView />
    </div>
  );
}
