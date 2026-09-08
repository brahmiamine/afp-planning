import type { Entrainement, Match, Plateau } from '@/types/match';

export type DuplicableEventType = 'amical' | 'entrainement' | 'plateau';

/**
 * Champs repris par une duplication ou un modèle d'événement (issue #188), à l'exclusion de
 * la date/heure (toujours ressaisies) et de tout ce qui relève de la publication ou des
 * réponses individuelles. La structure d'affectations (qui) est reprise ; le statut de
 * réponse de chaque personne ne l'est pas — `enrichAssignmentContacts` côté serveur repart
 * de `pending` faute de `status` dans le payload envoyé ici.
 */
export function extractReusableEventFields(
  eventType: DuplicableEventType,
  event: Match | Entrainement | Plateau,
): Record<string, unknown> {
  if (eventType === 'amical') {
    const match = event as Match;
    return {
      localTeam: match.localTeam,
      awayTeam: match.awayTeam,
      competition: match.competition,
      categorie: match.categorie,
      venue: match.venue,
      horaireRendezVous: match.horaireRendezVous,
      details: match.details,
      staff: match.staff,
      durationMinutes: match.durationMinutes,
    };
  }

  if (eventType === 'entrainement') {
    const training = event as Entrainement;
    return {
      lieu: training.lieu,
      categorie: training.categorie,
      durationMinutes: training.durationMinutes,
      encadrants: (training.encadrants ?? []).map((contact) => ({ nom: contact.nom, personId: contact.personId })),
    };
  }

  const plateau = event as Plateau;
  return {
    lieu: plateau.lieu,
    categories: plateau.categories,
    durationMinutes: plateau.durationMinutes,
    encadrants: (plateau.encadrants ?? []).map((contact) => ({ nom: contact.nom, personId: contact.personId })),
  };
}

export function creationEndpointFor(eventType: DuplicableEventType): string {
  if (eventType === 'amical') return '/api/matches-amicaux';
  if (eventType === 'entrainement') return '/api/entrainements';
  return '/api/plateaux';
}
