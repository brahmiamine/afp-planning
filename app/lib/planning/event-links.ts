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

/**
 * Vrai si la cible du clic est un élément interactif (bouton, lien, champ...) : dans ce cas,
 * un clic sur la carte englobante ne doit pas déclencher la navigation vers l'espace événement,
 * pour laisser l'élément interactif gérer lui-même le clic.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'));
}
