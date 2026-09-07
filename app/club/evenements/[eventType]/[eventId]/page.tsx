import { EventWorkspaceView } from '@/app/components/events/EventWorkspaceView';
import type { PlanningEventType } from '@/lib/planning/event-store';

export default async function EventWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventType: PlanningEventType; eventId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const fromDashboard = resolvedSearchParams.from === 'dashboard';
  return (
    <EventWorkspaceView
      eventType={resolvedParams.eventType}
      eventId={resolvedParams.eventId}
      backHref={fromDashboard ? '/club' : '/club/planning'}
      backLabel={fromDashboard ? 'Tableau de bord' : 'Préparation du planning'}
      readOnly={fromDashboard}
    />
  );
}
