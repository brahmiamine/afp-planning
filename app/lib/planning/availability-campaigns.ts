import type { UserRole } from '@/lib/auth/roles';
import { eventStartTimestamp } from './p0-rules';

/**
 * Clôture des campagnes de disponibilité (issue #87).
 *
 * Une campagne accepte des réponses jusqu'à son instant de clôture :
 * - `closesAt` explicite s'il est renseigné ;
 * - sinon la fin de la période couverte (`endDate` à 23:59, fuseau du club).
 *
 * Au-delà, l'API refuse toute réponse et l'UI marque la campagne « Clôturée ». Une
 * campagne dont la date de clôture est indéterminable (données invalides) reste
 * répondable : on ne bloque jamais faute de pouvoir vérifier.
 */

export interface AvailabilityCampaignPayload {
  title: string;
  startDate: string;
  endDate: string;
  targetRoles: UserRole[];
  message: string | null;
  createdByUserId: number;
  closesAt: string | null;
}

/** Instant de clôture d'une campagne, en epoch ms. `null` si indéterminable. */
export function availabilityCampaignClosesAt(
  payload: Pick<AvailabilityCampaignPayload, 'endDate' | 'closesAt'>,
  timeZone: string,
): number | null {
  if (payload.closesAt) {
    const closesAt = Date.parse(payload.closesAt);
    return Number.isNaN(closesAt) ? null : closesAt;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(payload.endDate);
  if (!match) return null;
  const [, year, month, day] = match;
  // Fin de période : 23:59 le dernier jour, dans le fuseau du club (issue #45).
  return eventStartTimestamp(`${day}/${month}/${year}`, '23:59', timeZone);
}

/** Vrai si la campagne n'accepte plus de réponses à l'instant `now`. */
export function isAvailabilityCampaignClosed(
  payload: Pick<AvailabilityCampaignPayload, 'endDate' | 'closesAt'>,
  timeZone: string,
  now = Date.now(),
): boolean {
  const closesAt = availabilityCampaignClosesAt(payload, timeZone);
  return closesAt !== null && closesAt <= now;
}
