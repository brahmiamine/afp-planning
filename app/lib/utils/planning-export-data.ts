import { apiGet } from './api';
import type { ClubInfo, Entrainement, Match, Plateau } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';

export type PlanningExportEvent = Match | Entrainement | Plateau;

export interface PlanningExportData {
  club: ClubInfo;
  events: PlanningExportEvent[];
  extras: Record<string, MatchExtras>;
}

/**
 * Source unique pour les exports administrateur (PDF, CSV) : le planning réellement
 * publié par défaut, avec repli documenté sur le brouillon de travail via `includeDrafts`
 * (même règle que /api/planning/export en CSV/HTML — issue #214). Un événement annulé
 * est exclu, jamais affiché comme actif.
 */
export async function fetchPlanningExportData(includeDrafts: boolean): Promise<PlanningExportData> {
  const params = new URLSearchParams({ format: 'json', t: String(Date.now()) });
  if (includeDrafts) params.set('includeDrafts', '1');
  return apiGet<PlanningExportData>(`/api/planning/export?${params.toString()}`);
}
