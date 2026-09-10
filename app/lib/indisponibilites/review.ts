import {
  indispoBlocksPlanning,
  normalizeIndisponibilites,
  type IndispoReviewStatus,
  type OfficielIndisponibilite,
} from '@/lib/utils/officiel-availability';

export const INDISPO_REVIEW_LABELS: Record<IndispoReviewStatus, string> = {
  pending: 'En attente',
  accepted: 'Acceptée',
  rejected: 'Refusée',
};

export function reviewStatusOf(rule: OfficielIndisponibilite): IndispoReviewStatus {
  return rule.status === 'pending' || rule.status === 'rejected' ? rule.status : 'accepted';
}

function scheduleKey(rule: OfficielIndisponibilite): string {
  return `${rule.type}|${rule.dateStart ?? rule.date ?? ''}|${rule.dateEnd ?? rule.date ?? ''}|${rule.startTime ?? ''}|${rule.endTime ?? ''}`;
}

/**
 * Fusionne les indisponibilités personnelles (issue #322) :
 * création/modification de créneau → `pending` ; créneau inchangé → statut conservé.
 * Le client ne peut pas s'auto-accepter.
 */
export function mergePersonalIndisponibilites(
  previous: OfficielIndisponibilite[],
  incoming: unknown,
  now: Date = new Date(),
): OfficielIndisponibilite[] {
  const previousById = new Map(normalizeIndisponibilites(previous).map((rule) => [rule.id, rule]));
  const nowIso = now.toISOString();

  return normalizeIndisponibilites(incoming).map((rule) => {
    const existing = previousById.get(rule.id);
    if (!existing) {
      return {
        ...rule,
        status: 'pending',
        createdAt: nowIso,
        reviewedAt: undefined,
        reviewedByUserId: undefined,
        reviewComment: undefined,
      };
    }
    if (scheduleKey(existing) === scheduleKey(rule)) {
      return {
        ...rule,
        status: existing.status,
        createdAt: existing.createdAt,
        reviewedAt: existing.reviewedAt,
        reviewedByUserId: existing.reviewedByUserId,
        reviewComment: existing.reviewComment,
      };
    }
    return {
      ...rule,
      status: 'pending',
      createdAt: existing.createdAt ?? nowIso,
      reviewedAt: undefined,
      reviewedByUserId: undefined,
      reviewComment: undefined,
    };
  });
}

export type IndispoReviewDecision = 'accepted' | 'rejected';

export type ApplyIndispoReviewResult =
  | { ok: true; idempotent: boolean; items: OfficielIndisponibilite[]; reviewed: OfficielIndisponibilite }
  | { ok: false; status: 404 | 409; error: string };

export function applyIndispoReview(
  items: OfficielIndisponibilite[],
  indisponibiliteId: string,
  decision: IndispoReviewDecision,
  reviewerUserId: number,
  comment: string | null,
  now: Date = new Date(),
): ApplyIndispoReviewResult {
  const index = items.findIndex((item) => item.id === indisponibiliteId);
  const current = index >= 0 ? items[index] : undefined;
  if (!current) {
    return { ok: false, status: 404, error: 'Indisponibilité introuvable' };
  }

  const currentStatus = reviewStatusOf(current);
  if (currentStatus === decision) {
    return { ok: true, idempotent: true, items, reviewed: current };
  }
  if (currentStatus !== 'pending') {
    return { ok: false, status: 409, error: 'Cette indisponibilité a déjà été tranchée' };
  }

  const reviewed: OfficielIndisponibilite = {
    ...current,
    status: decision,
    reviewedAt: now.toISOString(),
    reviewedByUserId: reviewerUserId,
    reviewComment: decision === 'rejected' ? (comment?.trim() || undefined) : undefined,
  };
  const next = [...items];
  next[index] = reviewed;
  return { ok: true, idempotent: false, items: next, reviewed };
}

export { indispoBlocksPlanning };
