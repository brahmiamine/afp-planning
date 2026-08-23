import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import { getPlanningEventSnapshot, type PlanningEventType } from '@/lib/planning/event-store';
import {
  findResourceBookingConflicts,
  type PlanningResourcePayload,
  type ResourceBookingPayload,
} from '@/lib/planning/resources';
import {
  deletePlanningRecord,
  getPlanningRecord,
  listPlanningRecords,
  planningRecordId,
  savePlanningRecord,
} from '@/lib/planning/records';
import { planningFeatureGuard } from '@/lib/planning/feature-guard';
import { setCurrentClubId } from '@/lib/auth/club-context';

function validEventType(value: unknown): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  const url = new URL(request.url);
  const eventType = url.searchParams.get('eventType');
  const eventId = url.searchParams.get('eventId')?.trim();
  const db = await getDb();
  const disabled = await planningFeatureGuard(db, 'resourceBookings');
  if (disabled) return disabled;
  const bookings = eventType && eventId && validEventType(eventType)
    ? await listPlanningRecords<ResourceBookingPayload>(db, { kind: 'resource-booking', eventType, eventId }, 250)
    : await listPlanningRecords<ResourceBookingPayload>(db, { kind: 'resource-booking' }, 1000);
  const resources = await listPlanningRecords<PlanningResourcePayload>(db, { kind: 'resource' }, 1000);
  return NextResponse.json({ bookings, resources });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const body = await request.json();
    const eventType = body.eventType;
    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const resourceId = typeof body.resourceId === 'string' ? body.resourceId.trim() : '';
    const quantity = Number.isInteger(Number(body.quantity)) && Number(body.quantity) > 0 ? Number(body.quantity) : 1;
    if (!eventId || !resourceId || !validEventType(eventType)) {
      return NextResponse.json({ error: 'Réservation invalide' }, { status: 400 });
    }

    const db = await getDb();
    const disabled = await planningFeatureGuard(db, 'resourceBookings');
    if (disabled) return disabled;
    const [snapshot, resource] = await Promise.all([
      getPlanningEventSnapshot(db, eventType, eventId),
      getPlanningRecord<PlanningResourcePayload>(db, resourceId),
    ]);
    if (!snapshot) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });
    if (!resource || resource.kind !== 'resource' || !resource.payload.active) {
      return NextResponse.json({ error: 'Ressource introuvable ou inactive' }, { status: 404 });
    }
    if (resource.payload.capacity !== null && quantity > resource.payload.capacity) {
      return NextResponse.json({ error: `Capacité maximale : ${resource.payload.capacity}` }, { status: 409 });
    }

    const conflicts = await findResourceBookingConflicts(db, resourceId, snapshot);
    if (conflicts.length) {
      return NextResponse.json({ error: 'Ressource déjà réservée sur un événement qui se chevauche', conflicts }, { status: 409 });
    }

    const alreadyBooked = (await listPlanningRecords<ResourceBookingPayload>(db, { kind: 'resource-booking', eventType, eventId }, 250))
      .find((item) => item.payload.resourceId === resourceId);
    if (alreadyBooked) return NextResponse.json({ error: 'Ressource déjà liée à cet événement' }, { status: 409 });

    const id = planningRecordId('resource-booking');
    const payload: ResourceBookingPayload = {
      resourceId,
      eventType,
      eventId,
      quantity,
      note: typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null,
      createdByUserId: auth.user.id,
    };
    await savePlanningRecord(db, { id, kind: 'resource-booking', eventType, eventId, ownerUserId: auth.user.id, payload });
    await logAuditEntry(db, { user: auth.user, entityType: 'PlanningResource', entityId: id, action: 'create', before: null, after: payload as unknown as Record<string, unknown> });
    return NextResponse.json({ success: true, booking: { id, payload }, resource: { id: resource.id, payload: resource.payload } });
  } catch (error) {
    console.error('Resource booking failed:', error);
    return NextResponse.json({ error: 'Impossible de réserver la ressource' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
  const db = await getDb();
  const disabled = await planningFeatureGuard(db, 'resourceBookings');
  if (disabled) return disabled;
  const record = await getPlanningRecord<ResourceBookingPayload>(db, id);
  if (!record || record.kind !== 'resource-booking') return NextResponse.json({ error: 'Réservation introuvable' }, { status: 404 });
  await deletePlanningRecord(db, id);
  await logAuditEntry(db, { user: auth.user, entityType: 'PlanningResource', entityId: id, action: 'delete', before: record.payload as unknown as Record<string, unknown>, after: null });
  return NextResponse.json({ success: true });
}
