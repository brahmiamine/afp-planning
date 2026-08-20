import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { isReadOnlyRole } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import type { UserEntity } from '@/lib/db/schemas';
import { logAuditEntry } from '@/lib/db/audit-log';
import { createNotificationForUser, notifyAdmins } from '@/lib/notifications/service';
import { buildAssignmentSuggestions } from '@/lib/planning/assignment-suggestions';
import {
  assignmentContactForUser,
  isAssignmentSwapOpen,
  nextAssignmentSwapStatus,
  rolePersonType,
  userHasPersonLink,
  type AssignmentSwapPayload,
} from '@/lib/planning/assignment-swaps';
import { getPlanningEventSnapshot, type PlanningEventType, type PlanningRole } from '@/lib/planning/event-store';
import { eventStartTimestamp, isVisiblePublicationStatus } from '@/lib/planning/p0-rules';
import {
  getPlanningRecord,
  listPlanningRecords,
  planningRecordId,
  savePlanningRecord,
  type PlanningRecordKind,
} from '@/lib/planning/records';
import { planningFeatureGuard } from '@/lib/planning/feature-guard';

const SWAP_KIND = 'assignment-swap' as PlanningRecordKind;

function validEventType(value: unknown): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

function validRole(value: unknown): value is PlanningRole {
  return value === 'arbitre' || value === 'encadrant' || value === 'accompagnateur';
}

async function activeUsers(db: Awaited<ReturnType<typeof getDb>>): Promise<UserEntity[]> {
  return db.getRepository<UserEntity>('User').find({ where: { active: true } });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  if (!isReadOnlyRole(auth.user.roles)) {
    return NextResponse.json({ error: 'Action réservée aux comptes personnels' }, { status: 403 });
  }

  const db = await getDb();
  const disabled = await planningFeatureGuard(db, 'assignmentSwaps');
  if (disabled) return disabled;
  const records = await listPlanningRecords<AssignmentSwapPayload>(db, { kind: SWAP_KIND }, 500);
  const mine = records.filter((record) => record.payload.requester.userId === auth.user.id);
  const incoming = records.filter((record) => record.payload.target.userId === auth.user.id);

  const url = new URL(request.url);
  const eventType = url.searchParams.get('eventType');
  const eventId = url.searchParams.get('eventId')?.trim();
  const role = url.searchParams.get('role');
  if (!eventType && !eventId && !role) return NextResponse.json({ mine, incoming, candidates: [] });
  if (!eventId || !validEventType(eventType) || !validRole(role)) {
    return NextResponse.json({ error: 'Événement ou rôle invalide' }, { status: 400 });
  }
  if (!auth.user.roles.includes(role)) {
    return NextResponse.json({ error: 'Votre compte ne possède pas le rôle de cette affectation' }, { status: 403 });
  }

  const snapshot = await getPlanningEventSnapshot(db, eventType, eventId);
  if (!snapshot || !isVisiblePublicationStatus(snapshot.planningStatus)) {
    return NextResponse.json({ error: 'Affectation introuvable' }, { status: 404 });
  }
  if (!assignmentContactForUser(auth.user, snapshot.assignments[role])) {
    return NextResponse.json({ error: 'Cette affectation ne vous appartient pas' }, { status: 403 });
  }

  const users = await activeUsers(db);
  const suggestions = await buildAssignmentSuggestions(db, snapshot, role, 20);
  const candidates = suggestions.flatMap((suggestion) => {
    const user = users.find((candidate) => candidate.id !== auth.user.id
      && candidate.roles?.includes(role)
      && userHasPersonLink(candidate, suggestion.personType, suggestion.personId));
    return user ? [{ ...suggestion, userId: user.id }] : [];
  });
  return NextResponse.json({ mine, incoming, candidates });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  if (!isReadOnlyRole(auth.user.roles)) {
    return NextResponse.json({ error: 'Action réservée aux comptes personnels' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const disabled = await planningFeatureGuard(db, 'assignmentSwaps');
    if (disabled) return disabled;
    const body = await request.json();
    const action = typeof body.action === 'string' ? body.action : 'create';

    if (action === 'create') {
      const eventType = body.eventType;
      const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
      const role = body.role;
      const targetUserId = Number(body.targetUserId);
      const targetPersonId = Number(body.targetPersonId);
      const targetPersonType = body.targetPersonType;
      const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) || null : null;
      if (!eventId || !validEventType(eventType) || !validRole(role)
        || !Number.isInteger(targetUserId) || targetUserId <= 0
        || !Number.isInteger(targetPersonId) || targetPersonId <= 0
        || targetPersonType !== rolePersonType(role)) {
        return NextResponse.json({ error: 'Demande d’échange invalide' }, { status: 400 });
      }
      if (!auth.user.roles.includes(role)) {
        return NextResponse.json({ error: 'Votre compte ne possède pas le rôle de cette affectation' }, { status: 403 });
      }

      const snapshot = await getPlanningEventSnapshot(db, eventType, eventId);
      if (!snapshot || !isVisiblePublicationStatus(snapshot.planningStatus)) {
        return NextResponse.json({ error: 'Affectation introuvable' }, { status: 404 });
      }
      const start = eventStartTimestamp(snapshot.date, snapshot.time);
      if (start === null || start <= Date.now()) {
        return NextResponse.json({ error: 'Un échange ne peut concerner qu’un événement à venir' }, { status: 409 });
      }
      const requesterContact = assignmentContactForUser(auth.user, snapshot.assignments[role]);
      if (!requesterContact?.personType || requesterContact.personId === undefined) {
        return NextResponse.json({ error: 'Cette affectation ne vous appartient pas' }, { status: 403 });
      }

      const suggestions = await buildAssignmentSuggestions(db, snapshot, role, 20);
      const targetSuggestion = suggestions.find((item) => item.personId === targetPersonId && item.personType === targetPersonType);
      if (!targetSuggestion) {
        return NextResponse.json({ error: 'La personne ciblée n’est plus éligible ou présente un conflit' }, { status: 409 });
      }
      const targetUser = await db.getRepository<UserEntity>('User').findOneBy({ id: targetUserId, active: true });
      if (!targetUser || targetUser.id === auth.user.id
        || !targetUser.roles?.includes(role)
        || !userHasPersonLink(targetUser, targetPersonType, targetPersonId)) {
        return NextResponse.json({ error: 'Utilisateur cible introuvable ou rôle incompatible' }, { status: 404 });
      }

      const existing = await listPlanningRecords<AssignmentSwapPayload>(db, { kind: SWAP_KIND, eventType, eventId }, 100);
      if (existing.some((record) => record.payload.requester.userId === auth.user.id
        && record.payload.role === role && isAssignmentSwapOpen(record.payload.status))) {
        return NextResponse.json({ error: 'Une demande d’échange est déjà ouverte pour cette affectation' }, { status: 409 });
      }

      const now = new Date().toISOString();
      const id = planningRecordId(SWAP_KIND);
      const payload: AssignmentSwapPayload = {
        role,
        eventType,
        eventId,
        eventTitle: snapshot.title,
        eventDate: snapshot.date,
        eventTime: snapshot.time,
        requester: {
          userId: auth.user.id,
          personType: requesterContact.personType,
          personId: requesterContact.personId,
          nom: auth.user.nom,
        },
        target: {
          userId: targetUser.id,
          personType: targetPersonType,
          personId: targetPersonId,
          nom: targetUser.nom,
        },
        status: 'pending-target',
        message,
        createdAt: now,
        targetRespondedAt: null,
        adminRespondedAt: null,
        adminUserId: null,
      };
      await savePlanningRecord(db, { id, kind: SWAP_KIND, eventType, eventId, ownerUserId: auth.user.id, payload });
      await createNotificationForUser(db, targetUser, {
        type: 'assignment-swap-requested',
        title: 'Proposition d’échange d’affectation',
        message: `${auth.user.nom} vous propose son affectation ${snapshot.title} du ${snapshot.date} à ${snapshot.time}.`,
        eventType,
        eventId,
        urgency: 'important',
      });
      await logAuditEntry(db, {
        user: auth.user,
        entityType: 'AssignmentSwap',
        entityId: id,
        action: 'create',
        before: null,
        after: payload as unknown as Record<string, unknown>,
      });
      return NextResponse.json({ success: true, swap: { id, ...payload } });
    }

    const recordId = typeof body.recordId === 'string' ? body.recordId.trim() : '';
    const record = recordId ? await getPlanningRecord<AssignmentSwapPayload>(db, recordId) : null;
    if (!record || record.kind !== SWAP_KIND) return NextResponse.json({ error: 'Demande d’échange introuvable' }, { status: 404 });

    if (action === 'cancel') {
      if (record.payload.requester.userId !== auth.user.id || !isAssignmentSwapOpen(record.payload.status)) {
        return NextResponse.json({ error: 'Cette demande ne peut pas être annulée' }, { status: 403 });
      }
      const target = await db.getRepository<UserEntity>('User').findOneBy({ id: record.payload.target.userId });
      const next = { ...record.payload, status: 'cancelled' as const };
      await savePlanningRecord(db, { id: record.id, kind: SWAP_KIND, eventType: record.eventType, eventId: record.eventId, ownerUserId: record.ownerUserId, payload: next });
      if (target) await createNotificationForUser(db, target, { type: 'assignment-swap-cancelled', title: 'Échange annulé', message: `${auth.user.nom} a annulé sa demande d’échange.`, eventType: record.eventType, eventId: record.eventId });
      return NextResponse.json({ success: true, status: next.status });
    }

    if (action === 'respond') {
      if (record.payload.target.userId !== auth.user.id) return NextResponse.json({ error: 'Cette demande ne vous est pas destinée' }, { status: 403 });
      if (!auth.user.roles.includes(record.payload.role)) {
        return NextResponse.json({ error: 'Votre compte ne possède plus le rôle requis' }, { status: 409 });
      }
      const decision = body.decision === 'accept' ? 'accept' : body.decision === 'decline' ? 'decline' : null;
      if (!decision) return NextResponse.json({ error: 'Réponse invalide' }, { status: 400 });
      const status = nextAssignmentSwapStatus(record.payload.status, 'target', decision);
      if (!status) return NextResponse.json({ error: 'Cette demande n’est plus en attente de votre réponse' }, { status: 409 });
      const next = { ...record.payload, status, targetRespondedAt: new Date().toISOString() };
      await savePlanningRecord(db, { id: record.id, kind: SWAP_KIND, eventType: record.eventType, eventId: record.eventId, ownerUserId: record.ownerUserId, payload: next });
      const requester = await db.getRepository<UserEntity>('User').findOneBy({ id: record.payload.requester.userId });
      if (requester) await createNotificationForUser(db, requester, {
        type: decision === 'accept' ? 'assignment-swap-target-accepted' : 'assignment-swap-target-declined',
        title: decision === 'accept' ? 'Échange accepté par la cible' : 'Échange refusé',
        message: decision === 'accept' ? `${auth.user.nom} accepte l’échange. Validation administrateur requise.` : `${auth.user.nom} refuse l’échange.`,
        eventType: record.eventType,
        eventId: record.eventId,
        urgency: decision === 'accept' ? 'important' : 'normal',
      });
      if (decision === 'accept') await notifyAdmins(db, {
        type: 'assignment-swap-admin-review',
        title: 'Échange à valider',
        message: `${record.payload.requester.nom} et ${record.payload.target.nom} ont accepté un échange sur ${record.payload.eventTitle}.`,
        eventType: record.eventType,
        eventId: record.eventId,
        urgency: 'important',
      });
      await logAuditEntry(db, { user: auth.user, entityType: 'AssignmentSwap', entityId: record.id, action: 'update', before: record.payload as unknown as Record<string, unknown>, after: next as unknown as Record<string, unknown> });
      return NextResponse.json({ success: true, status });
    }

    return NextResponse.json({ error: 'Action d’échange invalide' }, { status: 400 });
  } catch (error) {
    console.error('Personal assignment swap failed:', error);
    return NextResponse.json({ error: 'Impossible de traiter la demande d’échange' }, { status: 500 });
  }
}
