import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { isReadOnlyRole } from '@/lib/auth/roles';
import type { AssignmentContact, AssignmentStatus, DeclineReason, Entrainement, Plateau } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import type { EntrainementEntity, MatchExtraEntity, PlateauEntity } from '@/lib/db/schemas';
import { personIdentityMatches, personTypeForRole } from '@/lib/planning/person-link';
import type { SessionUser } from '@/lib/auth/session';
import { notifyAdmins } from '@/lib/notifications/service';
import { logAuditEntry } from '@/lib/db/audit-log';
import { getPlanningEventSnapshot, type PlanningEventType, type PlanningRole } from '@/lib/planning/event-store';
import { listPublishedPlanningEventSnapshots } from '@/lib/planning/published-planning';
import { eventStartTimestamp, isResponseWindowClosed, isVisiblePublicationStatus } from '@/lib/planning/p0-rules';
import { isDeclineReason } from '@/lib/planning/advanced-rules';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { readAppSettings } from '@/lib/settings-store';

function nextStatus(value: unknown): AssignmentStatus | null {
  return value === 'accepted' || value === 'declined' ? value : null;
}

function validEventType(value: unknown): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

function validRole(value: unknown): value is PlanningRole {
  return value === 'arbitre' || value === 'encadrant' || value === 'accompagnateur';
}

/**
 * Met à jour le contact correspondant à l'utilisateur dans la copie live, ou l'y
 * réinsère (à partir du contact publié) s'il n'y figure plus : l'admin a pu le
 * retirer du brouillon sans republier, mais l'affectation publiée — la seule que
 * l'utilisateur voit — lui appartient toujours, sa réponse ne doit donc jamais être
 * refusée silencieusement pour cette seule raison.
 */
function upsertContactResponse(
  contacts: AssignmentContact[] | undefined,
  user: SessionUser,
  publishedContact: AssignmentContact,
  status: AssignmentStatus,
  declineReason: DeclineReason | null,
  declineComment: string | null,
): AssignmentContact[] {
  const now = new Date().toISOString();
  let found = false;
  const next = (contacts ?? []).map((contact) => {
    if (!personIdentityMatches(contact, user)) return contact;
    found = true;
    return {
      ...contact,
      status,
      respondedAt: now,
      declineReason: status === 'declined' ? declineReason ?? undefined : undefined,
      declineComment: status === 'declined' && declineComment ? declineComment : undefined,
    };
  });
  if (!found) {
    next.push({
      ...publishedContact,
      status,
      respondedAt: now,
      assignedAt: publishedContact.assignedAt ?? now,
      declineReason: status === 'declined' ? declineReason ?? undefined : undefined,
      declineComment: status === 'declined' && declineComment ? declineComment : undefined,
    });
  }
  return next;
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

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  if (!isReadOnlyRole(auth.user.roles)) {
    return NextResponse.json({ error: 'Action réservée aux comptes personnels' }, { status: 403 });
  }

  const body = await request.json();
  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  const eventType = body.eventType;
  const role = body.role;
  const status = nextStatus(body.status);
  const declineReason = isDeclineReason(body.declineReason) ? body.declineReason : null;
  const declineComment = typeof body.declineComment === 'string'
    ? body.declineComment.trim().slice(0, 500)
    : null;

  if (!eventId || !status || !validEventType(eventType) || !validRole(role)) {
    return NextResponse.json({ error: 'Réponse d’affectation invalide' }, { status: 400 });
  }
  if ((eventType === 'entrainement' || eventType === 'plateau') && role !== 'encadrant') {
    return NextResponse.json({ error: 'Rôle invalide pour cet événement' }, { status: 400 });
  }
  if (status === 'declined' && !declineReason) {
    return NextResponse.json({ error: 'Un motif de refus est requis' }, { status: 400 });
  }
  if (!auth.user.roles.includes(role)) {
    return NextResponse.json({ error: 'Votre compte ne possède pas ce rôle' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const publishedSnapshots = await listPublishedPlanningEventSnapshots(db);
    const snapshot = publishedSnapshots
      ? publishedSnapshots.find((item) => item.eventType === eventType && item.eventId === eventId) ?? null
      : await getPlanningEventSnapshot(db, eventType, eventId);
    if (!snapshot) return NextResponse.json({ error: 'Affectation introuvable' }, { status: 404 });
    if (!isVisiblePublicationStatus(snapshot.planningStatus)) {
      const error = snapshot.planningStatus === 'cancelled'
        ? 'Cet événement a été annulé, votre réponse ne peut plus être modifiée.'
        : 'Cette affectation n’est pas publiée';
      return NextResponse.json({ error }, { status: 409 });
    }
    const publishedContact = snapshot.assignments[role].find((contact) => personIdentityMatches(contact, auth.user));
    if (!publishedContact) {
      return NextResponse.json({ error: 'Cette affectation ne vous appartient pas' }, { status: 403 });
    }

    // Issue #43 : le statut de confirmation est figé au coup d'envoi. Toute modification
    // postérieure fausserait l'historique, les statistiques de réponse et le suivi des
    // présences. L'heure de début est calculée dans le fuseau horaire du club.
    const { timeZone } = await readAppSettings(db, auth.user.clubId);
    const eventStart = eventStartTimestamp(snapshot.date, snapshot.time, timeZone);
    if (isResponseWindowClosed(eventStart)) {
      return NextResponse.json(
        { error: 'Cet événement a déjà commencé, votre réponse ne peut plus être modifiée.' },
        { status: 409 },
      );
    }

    // personIdentityMatches ne garantit l'identité de publishedContact.personId que si
    // personType est déjà renseigné (match par id) ; sans personType, la correspondance
    // s'est faite par nom, et un personId éventuellement présent n'a pas été vérifié —
    // on force alors l'identité de l'appelant plutôt que de faire confiance à cette valeur.
    const fallbackContact: AssignmentContact = {
      ...publishedContact,
      personId: publishedContact.personType ? publishedContact.personId : auth.user.id,
      personType: publishedContact.personType ?? personTypeForRole(role) ?? undefined,
    };

    if (eventType === 'officiel' || eventType === 'amical') {
      const field = MATCH_CONTACT_FIELDS[role as MatchAssignmentRole];
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      let before: MatchExtras;
      let next: MatchExtras;
      try {
        const repo = runner.manager.getRepository<MatchExtraEntity>('MatchExtra');
        const row = await repo
          .createQueryBuilder('extra')
          .setLock('pessimistic_write')
          .where('extra.matchId = :eventId', { eventId })
          .getOne();
        if (!row) {
          await runner.rollbackTransaction();
          return NextResponse.json({ error: 'Affectation introuvable' }, { status: 404 });
        }

        before = row.payload as unknown as MatchExtras;
        next = {
          ...before,
          [field]: upsertContactResponse(before[field], auth.user, fallbackContact, status, declineReason, declineComment),
        };
        row.payload = next as unknown as Record<string, unknown>;
        await repo.save(row);
        await runner.commitTransaction();
      } catch (error) {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        throw error;
      } finally {
        await runner.release();
      }

      await logAuditEntry(db, {
        user: auth.user,
        entityType: 'MatchExtra',
        entityId: eventId,
        action: 'update',
        before: before as unknown as Record<string, unknown>,
        after: next as unknown as Record<string, unknown>,
      });
    } else {
      const isTraining = eventType === 'entrainement';
      const repo = isTraining
        ? db.getRepository<EntrainementEntity>('Entrainement')
        : db.getRepository<PlateauEntity>('Plateau');
      const row = await repo.findOneBy({ id: eventId });
      if (!row) return NextResponse.json({ error: 'Affectation introuvable' }, { status: 404 });

      const before = row.payload as unknown as Entrainement | Plateau;
      const next = {
        ...before,
        encadrants: upsertContactResponse(before.encadrants, auth.user, fallbackContact, status, declineReason, declineComment),
      } as Entrainement | Plateau;
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
        ? `${auth.user.nom} a accepté son affectation (${role}).`
        : `${auth.user.nom} a refusé son affectation (${role}) sur ${snapshot.title}.${reasonSuffix} Un remplacement est requis si aucun autre affecté n’est actif.`,
      eventType,
      eventId,
    });

    return NextResponse.json({ success: true, status, declineReason, declineComment });
  } catch (error) {
    console.error('Error responding to assignment:', error);
    return NextResponse.json({ error: 'Impossible d’enregistrer votre réponse' }, { status: 500 });
  }
}
