'use client';

import { useParams } from 'next/navigation';
import { EventWorkspaceView } from '@/app/components/events/EventWorkspaceView';
import type { PlanningEventType } from '@/lib/planning/event-store';

export default function PersonalEventWorkspacePage() {
  const params = useParams<{ eventType: PlanningEventType; eventId: string }>();
  return (
    <EventWorkspaceView
      eventType={params.eventType}
      eventId={params.eventId}
      backHref="/mon-planning"
      backLabel="Mon planning"
    />
  );
}
