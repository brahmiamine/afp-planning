import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import type { UserEntity } from '@/lib/db/schemas';
import { logAuditEntry } from '@/lib/db/audit-log';
import { createNotificationForUser } from '@/lib/notifications/service';
import { buildAssignmentSuggestions } from '@/lib/planning/assignment-suggestions';
import {
  nextAssignmentSwapStatus,
  type AssignmentSwapPayload,
} from '@/lib/planning/assignment-swaps';
import { enrichAssignmentContacts } from '@/lib/planning/assignment-contacts';
import { getPlanningEventSnapshot, saveRoleAssignments } from '@/lib/planning/event-store';
import { eventStartTimestamp, isVisiblePublicationStatus } from '@/lib/planning/p0-rules';
import {
  getPlanningRecord,
  listPlanningRecords,
  savePlanningRecord,
  type PlanningRecordKind,
} from '@/lib/planning/records';
import { planningFeatureGuard } from '@/lib/planning/feature-guard';

const SWAP_KIND = 'assignment-swap' as PlanningRecordKind;

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  const db = await getDb();
  const disabled = await planningFeatureGuard(db, 'assignmentSwaps');
  if (disabled) return disabled;
  const records = await listPlanningRecords<AssignmentSwapPayload>(db, { kind: SWAP_KIND }, 500);
  return NextResponse.json({
    swaps: records.filter((record) => record.payload.status === 'pending-admin'),
    recent: records.slice(0, 100),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const recordId = typeof body.recordId === 'string' ? body.recordId.trim() : '';
    const decision = body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : null;
    if (!recordId || !decision) return NextResponse.json({ error: 'Décision invalide' }, { status: 400 });

    const db = await getDb();
    const disabled = await planningFeatureGuard(db, 'assignmentSwaps');
    if (disabled) return disabled;
    const record = await getPlanningRecord<AssignmentSwapPayload>(db, recordId);
    if (!record || record.kind !== SWAP_KIND) return NextResponse.json({ error: 'Demande d’échange introuvable' }, { status: 404 });
    const status = nextAssignmentSwapStatus(record.payload.status, 'admin', decision);
    if (!status) return NextResponse.json({ error: 'Cet échange n’attend plus de validation administrateur' }, { status: 409 });

    const requester = await db.getRepository<UserEntity>('User').findOneBy({ id: record.payload.requester.userId });
    const target = await db.getRepository<UserEntity>('User').findOneBy({ id: record.payload.target.userId });
    if (!requester?.active || !target?.active) {
      return NextResponse.json({ error: 'Un utilisateur de l’échange est introuvable ou inactif' }, { status: 409 });
    }
    if (!target.roles?.includes(record.payload.role)) {
      return NextResponse.json({ error: 'La personne cible ne possède plus le rôle requis' }, { status: 409 });
    }

    if (decision === 'approve') {
      const snapshot = await getPlanningEventSnapshot(db, record.payload.eventType, record.payload.eventId);
      if (!snapshot) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });
      if (!isVisiblePublicationStatus(snapshot.planningStatus)) {
        return NextResponse.json({ error: 'Cet événement n’est plus publié' }, { status: 409 });
      }
      const start = eventStartTimestamp(snapshot.date, snapshot.time);
      if (start === null || start <= Date.now()) {
        return NextResponse.json({ error: 'Cet événement a déjà commencé ou sa date est invalide' }, { status: 409 });
      }

      const before = snapshot.assignments[record.payload.role];
      const requesterStillAssigned = before.some((contact) => contact.status !== 'declined'
        && contact.personType === record.payload.requester.personType
        && contact.personId === record.payload.requester.personId);
      if (!requesterStillAssigned) {
        return NextResponse.json({ error: 'L’affectation du demandeur a changé depuis la demande' }, { status: 409 });
      }

      const suggestions = await buildAssignmentSuggestions(db, snapshot, record.payload.role, 20);
      const candidate = suggestions.find((item) => item.personType === record.payload.target.personType
        && item.personId === record.payload.target.personId);
      if (!candidate) {
        return NextResponse.json({ error: 'La personne cible n’est plus disponible ou présente désormais un conflit' }, { status: 409 });
      }

      const retained = before.filter((contact) => !(contact.personType === record.payload.requester.personType
        && contact.personId === record.payload.requester.personId));
      const next = await enrichAssignmentContacts(db, [
        ...retained,
        {
          nom: candidate.nom,
          numero: candidate.telephone ?? '',
          personType: candidate.personType,
          personId: candidate.personId,
          status: 'accepted',
          assignedAt: new Date().toISOString(),
          respondedAt: record.payload.targetRespondedAt ?? new Date().toISOString(),
        },
      ], candidate.personType, retained);
      await saveRoleAssignments(db, snapshot, record.payload.role, next);
    }

    const nextPayload: AssignmentSwapPayload = {
      ...record.payload,
      status,
      adminRespondedAt: new Date().toISOString(),
      adminUserId: auth.user.id,
    };
    await savePlanningRecord(db, {
      id: record.id,
      kind: SWAP_KIND,
      eventType: record.eventType,
      eventId: record.eventId,
      ownerUserId: record.ownerUserId,
      payload: nextPayload,
    });

    const title = decision === 'approve' ? 'Échange d’affectation validé' : 'Échange d’affectation refusé';
    const message = decision === 'approve'
      ? `L’échange pour ${record.payload.eventTitle} du ${record.payload.eventDate} à ${record.payload.eventTime} est validé.`
      : `L’administrateur a refusé l’échange pour ${record.payload.eventTitle}.`;
    await Promise.all([
      createNotificationForUser(db, requester, { type: `assignment-swap-${status}`, title, message, eventType: record.eventType, eventId: record.eventId, urgency: 'important' }),
      createNotificationForUser(db, target, { type: `assignment-swap-${status}`, title, message, eventType: record.eventType, eventId: record.eventId, urgency: 'important' }),
    ]);
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'AssignmentSwap',
      entityId: record.id,
      action: decision === 'approve' ? 'approve' : 'reject',
      before: record.payload as unknown as Record<string, unknown>,
      after: nextPayload as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error('Admin assignment swap failed:', error);
    return NextResponse.json({ error: 'Impossible de valider cet échange' }, { status: 500 });
  }
}
