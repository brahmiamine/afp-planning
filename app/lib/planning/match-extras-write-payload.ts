import type { AssignmentContact } from '@/types/match';

/**
 * Seuls ces champs sont acceptés par `PUT /api/matches/[id]`.
 * Un GET d'extras de match officiel y ajoute des métadonnées serveur
 * (`planningStatus`, `officialSourceSnapshot`, …) : les renvoyer telles quelles
 * fait échouer l'affectation avec 400 « champ non autorisé ».
 */
export const MATCH_EXTRAS_CLIENT_WRITE_FIELDS = [
  'id',
  'confirmed',
  'arbitreTouche',
  'contactEncadrants',
  'contactAccompagnateur',
] as const;

export interface MatchExtrasWritePayload {
  id: string;
  confirmed?: boolean;
  arbitreTouche?: AssignmentContact[];
  contactEncadrants?: AssignmentContact[];
  contactAccompagnateur?: AssignmentContact[];
}

export function pickMatchExtrasWritePayload(extras: MatchExtrasWritePayload): MatchExtrasWritePayload {
  return {
    id: extras.id,
    confirmed: extras.confirmed,
    arbitreTouche: extras.arbitreTouche,
    contactEncadrants: extras.contactEncadrants,
    contactAccompagnateur: extras.contactAccompagnateur,
  };
}
