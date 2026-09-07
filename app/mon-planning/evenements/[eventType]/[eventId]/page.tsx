'use client';

import { useParams } from 'next/navigation';
import { Header } from '@/app/components/layout/Header';
import { EventWorkspaceView } from '@/app/components/events/EventWorkspaceView';
import type { PlanningEventType } from '@/lib/planning/event-store';

export default function PersonalEventWorkspacePage() {
  const params = useParams<{ eventType: PlanningEventType; eventId: string }>();
  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => {}} />
      <main className="container mx-auto px-3 py-4 sm:px-4 sm:py-8">
        <EventWorkspaceView
          eventType={params.eventType}
          eventId={params.eventId}
          backHref="/mon-planning"
          backLabel="Mon planning"
          personalScope
        />
      </main>
    </div>
  );
}
