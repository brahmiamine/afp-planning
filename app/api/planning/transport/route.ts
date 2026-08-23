import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { canEdit } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import { canReadPlanningEventWorkspace } from '@/lib/planning/event-access';
import { getPlanningEventSnapshot, type PlanningEventType } from '@/lib/planning/event-store';
import { getPlanningRecord, savePlanningRecord } from '@/lib/planning/records';
import { setCurrentClubId } from '@/lib/auth/club-context';

interface TransportPayload {
  departurePoint: string;
  departureTime: string;
  driverUserId: number | null;
  driverName: string | null;
  seats: number;
  passengerUserIds: number[];
  note: string | null;
  updatedByUserId: number;
}

function validEventType(value: unknown): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

function transportId(eventType: PlanningEventType, eventId: string): string {
  return `transport:${eventType}:${eventId}`;
}

async function loadEvent(request: NextRequest, eventTypeValue: unknown, eventIdValue: unknown) {
  const auth = await requireAuth(request);
  if ('error' in auth) return { error: auth.error } as const;
  setCurrentClubId(auth.user.clubId);
  const eventId = typeof eventIdValue === 'string' ? eventIdValue.trim() : '';
  if (!eventId || !validEventType(eventTypeValue)) return { error: NextResponse.json({ error: 'Événement invalide' }, { status: 400 }) } as const;
  const db = await getDb();
  const snapshot = await getPlanningEventSnapshot(db, eventTypeValue, eventId);
  if (!snapshot) return { error: NextResponse.json({ error: 'Événement introuvable' }, { status: 404 }) } as const;
  if (!canReadPlanningEventWorkspace(auth.user, snapshot)) return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) } as const;
  return { auth, db, snapshot, eventType: eventTypeValue, eventId } as const;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const ctx = await loadEvent(request, url.searchParams.get('eventType'), url.searchParams.get('eventId'));
  if ('error' in ctx) return ctx.error;
  const record = await getPlanningRecord<TransportPayload>(ctx.db, transportId(ctx.eventType, ctx.eventId));
  return NextResponse.json({ transport: record, canManage: canEdit(ctx.auth.user.roles) });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const ctx = await loadEvent(request, body.eventType, body.eventId);
  if ('error' in ctx) return ctx.error;
  if (!canEdit(ctx.auth.user.roles)) return NextResponse.json({ error: 'Gestion du transport réservée aux administrateurs' }, { status: 403 });

  const departurePoint = typeof body.departurePoint === 'string' ? body.departurePoint.trim().slice(0, 300) : '';
  const departureTime = typeof body.departureTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.departureTime) ? body.departureTime : '';
  const seats = Number(body.seats);
  if (!departurePoint || !departureTime || !Number.isInteger(seats) || seats < 1 || seats > 100) {
    return NextResponse.json({ error: 'Plan de transport invalide' }, { status: 400 });
  }
  const id = transportId(ctx.eventType, ctx.eventId);
  const before = await getPlanningRecord<TransportPayload>(ctx.db, id);
  const existingPassengers = before?.payload.passengerUserIds ?? [];
  const payload: TransportPayload = {
    departurePoint,
    departureTime,
    driverUserId: Number.isInteger(Number(body.driverUserId)) ? Number(body.driverUserId) : null,
    driverName: typeof body.driverName === 'string' ? body.driverName.trim().slice(0, 160) || null : null,
    seats,
    passengerUserIds: existingPassengers.slice(0, seats),
    note: typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null,
    updatedByUserId: ctx.auth.user.id,
  };
  await savePlanningRecord(ctx.db, { id, kind: 'transport', eventType: ctx.eventType, eventId: ctx.eventId, ownerUserId: ctx.auth.user.id, payload });
  await logAuditEntry(ctx.db, { user: ctx.auth.user, entityType: 'PlanningResource', entityId: id, action: before ? 'update' : 'create', before: before?.payload as unknown as Record<string, unknown> ?? null, after: payload as unknown as Record<string, unknown> });
  return NextResponse.json({ success: true, transport: { id, payload } });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const ctx = await loadEvent(request, body.eventType, body.eventId);
  if ('error' in ctx) return ctx.error;
  if (body.action !== 'join' && body.action !== 'leave') return NextResponse.json({ error: 'Action transport invalide' }, { status: 400 });
  const id = transportId(ctx.eventType, ctx.eventId);
  const record = await getPlanningRecord<TransportPayload>(ctx.db, id);
  if (!record || record.kind !== 'transport') return NextResponse.json({ error: 'Aucun transport configuré' }, { status: 404 });
  const current = new Set(record.payload.passengerUserIds);
  if (body.action === 'join') {
    if (!current.has(ctx.auth.user.id) && current.size >= record.payload.seats) return NextResponse.json({ error: 'Plus aucune place disponible' }, { status: 409 });
    current.add(ctx.auth.user.id);
  } else {
    current.delete(ctx.auth.user.id);
  }
  const payload = { ...record.payload, passengerUserIds: [...current], updatedByUserId: ctx.auth.user.id };
  await savePlanningRecord(ctx.db, { id, kind: 'transport', eventType: ctx.eventType, eventId: ctx.eventId, ownerUserId: record.ownerUserId, payload });
  await logAuditEntry(ctx.db, { user: ctx.auth.user, entityType: 'PlanningResource', entityId: id, action: 'update', before: record.payload as unknown as Record<string, unknown>, after: payload as unknown as Record<string, unknown> });
  return NextResponse.json({ success: true, transport: { ...record, payload } });
}
