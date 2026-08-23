import type { Entrainement, Match, Plateau } from '@/types/match';

export type PlanningEventLinkType = 'officiel' | 'amical' | 'entrainement' | 'plateau';

type PlanningEvent = Match | Entrainement | Plateau;

export function planningEventTypeFromEvent(event: PlanningEvent): PlanningEventLinkType {
  if ('localTeam' in event || 'competition' in event) {
    return event.type === 'amical' ? 'amical' : 'officiel';
  }

  return event.type === 'plateau' ? 'plateau' : 'entrainement';
}

export function eventWorkspaceHref(eventType: PlanningEventLinkType, eventId: string): string {
  return `/club/evenements/${eventType}/${encodeURIComponent(eventId)}`;
}
