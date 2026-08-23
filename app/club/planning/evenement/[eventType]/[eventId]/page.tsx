import { notFound, redirect } from 'next/navigation';
import { eventWorkspaceHref, type PlanningEventLinkType } from '@/lib/planning/event-links';

function validEventType(value: string): value is PlanningEventLinkType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

export default async function LegacyEventWorkspacePage({
  params,
}: {
  params: Promise<{ eventType: string; eventId: string }>;
}) {
  const { eventType, eventId } = await params;
  if (!validEventType(eventType) || !eventId) notFound();

  redirect(eventWorkspaceHref(eventType, eventId));
}
