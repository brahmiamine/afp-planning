import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require';
import {
  canEdit,
  hasAnyPlanningFunction,
  isPlanningFunction,
  normalizePlanningFunctions,
  WRITE_ROLES,
  type PlanningFunction,
} from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import type { UserEntity } from '@/lib/db/schemas';
import { createNotificationForUser } from '@/lib/notifications/service';
import {
  isAvailabilityCampaignClosed,
  type AvailabilityCampaignPayload,
} from '@/lib/planning/availability-campaigns';
import {
  deletePlanningRecord,
  listPlanningRecords,
  planningRecordId,
  savePlanningRecord,
} from '@/lib/planning/records';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { readAppSettings } from '@/lib/settings-store';

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Une campagne cible des fonctions opérationnelles, jamais un rôle d'accès (issue #209). */
function normalizeTargetRoles(value: unknown): PlanningFunction[] {
  if (!Array.isArray(value)) return [];
  return normalizePlanningFunctions(value.filter(isPlanningFunction));
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  const db = await getDb();
  const { timeZone } = await readAppSettings(db, auth.user.clubId);
  const records = (await listPlanningRecords<AvailabilityCampaignPayload>(db, { kind: 'availability-request' }, 250))
    .map((record) => ({ ...record, closed: isAvailabilityCampaignClosed(record.payload, timeZone) }));

  const personalScope = new URL(request.url).searchParams.get('scope') === 'personal';
  if (canEdit(auth.user.accessRole) && !personalScope) {
    const responses = await listPlanningRecords(db, { kind: 'availability-response' }, 1000);
    return NextResponse.json({ requests: records, responses });
  }
  if (!hasAnyPlanningFunction(auth.user.planningFunctions)) {
    return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });
  }

  const visible = records.filter((record) =>
    auth.user.planningFunctions.some((planningFunction) => record.payload.targetRoles.includes(planningFunction)),
  );
  const responses = await listPlanningRecords(db, { kind: 'availability-response', ownerUserId: auth.user.id }, 250);
  return NextResponse.json({ requests: visible, responses });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';
    const startDate = body.startDate;
    const endDate = body.endDate;
    const targetRoles = normalizeTargetRoles(body.targetRoles);
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) || null : null;
    const responseScope = body.responseScope === 'function' ? 'function' : 'person';
    const closesAt = typeof body.closesAt === 'string' && !Number.isNaN(Date.parse(body.closesAt))
      ? new Date(body.closesAt).toISOString()
      : null;

    if (!title || !validDate(startDate) || !validDate(endDate) || startDate > endDate || targetRoles.length === 0) {
      return NextResponse.json({ error: 'Demande de disponibilité invalide' }, { status: 400 });
    }

    const db = await getDb();
    const id = planningRecordId('availability-request');
    const payload: AvailabilityCampaignPayload = {
      title,
      startDate,
      endDate,
      targetRoles,
      responseScope,
      message,
      createdByUserId: auth.user.id,
      closesAt,
    };
    await savePlanningRecord(db, { id, kind: 'availability-request', ownerUserId: auth.user.id, payload });

    // Issue #198 : sans ce filtre, une campagne du club A pouvait notifier des dirigeants
    // du club B (base partagée entre clubs) et leur exposer son titre, ses dates et son
    // message.
    const users = await db.getRepository<UserEntity>('User').find({ where: { clubId: auth.user.clubId } });
    await Promise.all(users
      .filter((user) => user.active
        && normalizePlanningFunctions(user.planningFunctions).some((fn) => targetRoles.includes(fn)))
      .map((user) => createNotificationForUser(db, user, {
        type: 'availability-request',
        title: 'Demande de disponibilité',
        message: `${title} — du ${startDate} au ${endDate}${message ? ` : ${message}` : ''}`,
      })));

    return NextResponse.json({ success: true, request: { id, ...payload } });
  } catch (error) {
    console.error('Error creating availability request:', error);
    return NextResponse.json({ error: 'Impossible de créer la demande de disponibilité' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });

  const db = await getDb();
  const deleted = await deletePlanningRecord(db, id);
  if (!deleted) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
  const responses = await listPlanningRecords(db, { kind: 'availability-response', eventId: id }, 1000);
  await Promise.all(responses.map((response) => deletePlanningRecord(db, response.id)));
  return NextResponse.json({ success: true });
}
