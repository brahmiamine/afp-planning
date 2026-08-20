import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { isReadOnlyRole, readOnlyRolesOf } from '@/lib/auth/roles';
import type { AssignmentContact, AssignmentStatus, DeclineReason, Entrainement, Plateau } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import type { EntrainementEntity, MatchExtraEntity, PlateauEntity } from '@/lib/db/schemas';
import { personIdentityMatches } from '@/lib/planning/person-link';
import type { SessionUser } from '@/lib/auth/session';
import { notifyAdmins } from '@/lib/notifications/service';
import { logAuditEntry } from '@/lib/db/audit-log';
import { getPlanningEventSnapshot, type PlanningEventType } from '@/lib/planning/event-store';
import { isVisiblePublicationStatus } from '@/lib/planning/p0-rules';
import { isDeclineReason } from '@/lib/planning/advanced-rules';

function nextStatus(value: unknown): AssignmentStatus | null {
  return value === 'accepted' || value === 'declined' ? value : null;
}

function validEventType(value: unknown): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

function updateContact(
  contacts: AssignmentContact[] | undefined,
  user: SessionUser,
  status: AssignmentStatus,
  declineReason: DeclineReason | null,
  declineComment: string | null,
): { contacts: AssignmentContact[]; changed: boolean } {
  let changed = false;
  const next = (contacts ?? []).map((contact) => {
    if (!personIdentityMatches(contact, user)) return contact;
    changed = true;
    return {
      ...contact,
      status,
      respondedAt: new Date().toISOString(),
      declineReason: status === 'declined' ? declineReason ?? undefined : undefined,
      declineComment: status === 'declined' && declineComment ? declineComment : undefined,
    };
  });
  return { contacts: next, changed };
}

type MatchAssignmentRole = 'arbitre' | 'encadrant' | 'accompagnateur';

const MATCH_CONTACT_FIELDS: Record<
  MatchAssignmentRole,
  keyof Pick<MatchExtras, 'arbitreTouche' | 'contactEncadrants' | 'contactAccompagnateur'>
> = {
  arbitre: 'arbitreTouche',
  encadrant: 'contactEncadrants',
  accompagnateur: 'contactAccompagnateur',
};

function isMatchAssignmentRole(role: string): role is MatchAssignmentRole {
  return role === 'arbitre' || role === 'encadrant' || role === 'accompagnateur';
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  if (!isReadOnlyRole(auth.user.roles)) {
    return NextResponse.json({ error: 'Action réservée aux comptes personnels' }, { status: 403 });
  }

  const body = await request.json();
  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  const eventType = body.eventType;
  const status = nextStatus(body.status);
  const declineReason = isDeclineReason(body.declineReason) ? body.declineReason : null;
  const declineComment = typeof body.declineComment === 'string'
    ? body.declineComment.trim().slice(0, 500)
    : null;

  if (!eventId || !status || !validEventType(eventType)) {
    return NextResponse.json({ error: 'Réponse d’affectation invalide' }, { status: 400 });
  }
  if (status === 'declined' && !declineReason) {
    return NextResponse.json({ error: 'Un motif de refus est requis' }, { status: 400 });
  }

  const heldRoles = readOnlyRolesOf(auth.user.roles);

  try {
    const db = await getDb();
    const snapshot = await getPlanningEventSnapshot(db, eventType, eventId);
    if (!snapshot) return NextResponse.json({ error: 'Affectation introuvable' }, { status: 404 });
    if (!isVisiblePublicationStatus(snapshot.planningStatus)) {
      return NextResponse.json({ error: 'Cette affectation n’est pas publiée' }, { status: 409 });
    }

    if (eventType === 'officiel' || eventType === 'amical') {
      const repo = db.getRepository<MatchExtraEntity>('MatchExtra');
      const row = await repo.findOneBy({ matchId: eventId });
      if (!row) return NextResponse.json({ error: 'Affectation introuvable' }, { status: 404 });

      const before = row.payload as unknown as MatchExtras;
      const next: MatchExtras = { ...before };
      let changedAny = false;

      for (const role of heldRoles.filter(isMatchAssignmentRole)) {
        const field = MATCH_CONTACT_FIELDS[role];
        const result = updateContact(before[field], auth.user, status, declineReason, declineComment);
        if (result.changed) {
          next[field] = result.contacts;
          changedAny = true;
        }
      }

      if (!changedAny) return NextResponse.json({ error: 'Cette affectation ne vous appartient pas' }, { status: 403 });
      row.payload = next as unknown as Record<string, unknown>;
      await repo.save(row);
      await logAuditEntry(db, {
        user: auth.user,
        entityType: 'MatchExtra',
        entityId: eventId,
        action: 'update',
        before: before as unknown as Record<string, unknown>,
        after: next as unknown as Record<string, unknown>,
      });
    } else {
      if (!heldRoles.includes('encadrant')) {
        return NextResponse.json({ error: 'Cette affectation ne vous appartient pas' }, { status: 403 });
      }
      const isTraining = eventType === 'entrainement';
      const repo = isTraining
        ? db.getRepository<EntrainementEntity>('Entrainement')
        : db.getRepository<PlateauEntity>('Plateau');
      const row = await repo.findOneBy({ id: eventId });
      if (!row) return NextResponse.json({ error: 'Affectation introuvable' }, { status: 404 });

      const before = row.payload as unknown as Entrainement | Plateau;
      const result = updateContact(before.encadrants, auth.user, status, declineReason, declineComment);
      if (!result.changed) return NextResponse.json({ error: 'Cette affectation ne vous appartient pas' }, { status: 403 });

      const next = { ...before, encadrants: result.contacts } as Entrainement | Plateau;
      row.payload = next as unknown as Record<string, unknown>;
      await repo.save(row);
      await logAuditEntry(db, {
        user: auth.user,
        entityType: isTraining ? 'Entrainement' : 'Plateau',
        entityId: eventId,
        action: 'update',
        before: before as unknown as Record<string, unknown>,
        after: next as unknown as Record<string, unknown>,
      });
    }

    const reasonSuffix = status === 'declined'
      ? ` Motif : ${declineReason}${declineComment ? ` — ${declineComment}` : ''}.`
      : '';
    await notifyAdmins(db, {
      type: status === 'declined' ? 'assignment-replacement-required' : 'assignment-response',
      title: status === 'accepted' ? 'Affectation acceptée' : 'Remplacement requis',
      message: status === 'accepted'
        ? `${auth.user.nom} a accepté son affectation.`
        : `${auth.user.nom} a refusé son affectation sur ${snapshot.title}.${reasonSuffix} Un remplacement est requis si aucun autre affecté n’est actif.`,
      eventType,
      eventId,
    });

    return NextResponse.json({ success: true, status, declineReason, declineComment });
  } catch (error) {
    console.error('Error responding to assignment:', error);
    return NextResponse.json({ error: 'Impossible d’enregistrer votre réponse' }, { status: 500 });
  }
}
