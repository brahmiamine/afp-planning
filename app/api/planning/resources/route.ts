import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require';
import { canEdit, WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import { normalizePlanningResource, type PlanningResourcePayload } from '@/lib/planning/resources';
import { deletePlanningRecord, listPlanningRecords, planningRecordId, savePlanningRecord } from '@/lib/planning/records';
import { planningFeatureGuard } from '@/lib/planning/feature-guard';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  const db = await getDb();
  const disabled = await planningFeatureGuard(db, 'resourceBookings');
  if (disabled) return disabled;
  const resources = await listPlanningRecords<PlanningResourcePayload>(db, { kind: 'resource' }, 500);
  return NextResponse.json({ resources: resources.filter((record) => record.payload.active || canEdit(auth.user.roles)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  try {
    const body = await request.json();
    const payload = normalizePlanningResource(body);
    if (!payload) return NextResponse.json({ error: 'Ressource invalide' }, { status: 400 });
    const db = await getDb();
    const disabled = await planningFeatureGuard(db, 'resourceBookings');
    if (disabled) return disabled;
    const id = planningRecordId('resource');
    await savePlanningRecord(db, { id, kind: 'resource', ownerUserId: auth.user.id, payload });
    await logAuditEntry(db, { user: auth.user, entityType: 'PlanningResource', entityId: id, action: 'create', before: null, after: payload as unknown as Record<string, unknown> });
    return NextResponse.json({ success: true, resource: { id, payload } });
  } catch (error) {
    console.error('Resource create failed:', error);
    return NextResponse.json({ error: 'Impossible de créer la ressource' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  const body = await request.json();
  const id = typeof body.id === 'string' ? body.id : '';
  const payload = normalizePlanningResource(body);
  if (!id || !payload) return NextResponse.json({ error: 'Ressource invalide' }, { status: 400 });
  const db = await getDb();
  const disabled = await planningFeatureGuard(db, 'resourceBookings');
  if (disabled) return disabled;
  const existing = (await listPlanningRecords<PlanningResourcePayload>(db, { kind: 'resource' }, 1000)).find((item) => item.id === id);
  if (!existing) return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });
  await savePlanningRecord(db, { id, kind: 'resource', ownerUserId: existing.ownerUserId, payload });
  await logAuditEntry(db, { user: auth.user, entityType: 'PlanningResource', entityId: id, action: 'update', before: existing.payload as unknown as Record<string, unknown>, after: payload as unknown as Record<string, unknown> });
  return NextResponse.json({ success: true, resource: { id, payload } });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
  const db = await getDb();
  const disabled = await planningFeatureGuard(db, 'resourceBookings');
  if (disabled) return disabled;
  const bookings = await listPlanningRecords<{ resourceId: string }>(db, { kind: 'resource-booking' }, 1000);
  if (bookings.some((booking) => booking.payload.resourceId === id)) {
    return NextResponse.json({ error: 'Cette ressource possède encore des réservations' }, { status: 409 });
  }
  const deleted = await deletePlanningRecord(db, id);
  if (!deleted) return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });
  await logAuditEntry(db, { user: auth.user, entityType: 'PlanningResource', entityId: id, action: 'delete', before: null, after: null });
  return NextResponse.json({ success: true });
}
