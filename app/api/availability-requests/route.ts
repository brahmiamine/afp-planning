import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require';
import { isReadOnlyRole, WRITE_ROLES, type UserRole } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import type { UserEntity } from '@/lib/db/schemas';
import { createNotificationForUser } from '@/lib/notifications/service';
import {
  deletePlanningRecord,
  listPlanningRecords,
  planningRecordId,
  savePlanningRecord,
} from '@/lib/planning/records';

interface AvailabilityRequestPayload {
  title: string;
  startDate: string;
  endDate: string;
  targetRoles: UserRole[];
  message: string | null;
  createdByUserId: number;
  closesAt: string | null;
}

const PERSONAL_ROLES: UserRole[] = ['arbitre', 'encadrant', 'accompagnateur'];

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTargetRoles(value: unknown): UserRole[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((role): role is UserRole => PERSONAL_ROLES.includes(role as UserRole)))];
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  const db = await getDb();
  const records = await listPlanningRecords<AvailabilityRequestPayload>(db, { kind: 'availability-request' }, 250);

  if (!isReadOnlyRole(auth.user.role)) {
    const responses = await listPlanningRecords(db, { kind: 'availability-response' }, 1000);
    return NextResponse.json({ requests: records, responses });
  }

  const visible = records.filter((record) => record.payload.targetRoles.includes(auth.user.role));
  const responses = await listPlanningRecords(db, { kind: 'availability-response', ownerUserId: auth.user.id }, 250);
  return NextResponse.json({ requests: visible, responses });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';
    const startDate = body.startDate;
    const endDate = body.endDate;
    const targetRoles = normalizeTargetRoles(body.targetRoles);
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) || null : null;
    const closesAt = typeof body.closesAt === 'string' && !Number.isNaN(Date.parse(body.closesAt))
      ? new Date(body.closesAt).toISOString()
      : null;

    if (!title || !validDate(startDate) || !validDate(endDate) || startDate > endDate || targetRoles.length === 0) {
      return NextResponse.json({ error: 'Demande de disponibilité invalide' }, { status: 400 });
    }

    const db = await getDb();
    const id = planningRecordId('availability-request');
    const payload: AvailabilityRequestPayload = {
      title,
      startDate,
      endDate,
      targetRoles,
      message,
      createdByUserId: auth.user.id,
      closesAt,
    };
    await savePlanningRecord(db, { id, kind: 'availability-request', ownerUserId: auth.user.id, payload });

    const users = await db.getRepository<UserEntity>('User').find();
    await Promise.all(users
      .filter((user) => user.active && targetRoles.includes(user.role as UserRole))
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
  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });

  const db = await getDb();
  const deleted = await deletePlanningRecord(db, id);
  if (!deleted) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
  const responses = await listPlanningRecords(db, { kind: 'availability-response', eventId: id }, 1000);
  await Promise.all(responses.map((response) => deletePlanningRecord(db, response.id)));
  return NextResponse.json({ success: true });
}
