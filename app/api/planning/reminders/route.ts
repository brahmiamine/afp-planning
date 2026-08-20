import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import {
  getPlanningEventSnapshot,
  type PlanningEventType,
  type PlanningRole,
} from '@/lib/planning/event-store';
import { sendManualAssignmentReminder } from '@/lib/planning/reminders';
import { logAuditEntry } from '@/lib/db/audit-log';

function validEventType(value: unknown): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

function validRole(value: unknown): value is PlanningRole {
  return value === 'arbitre' || value === 'encadrant' || value === 'accompagnateur';
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const eventType = body.eventType;
    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const role = body.role;
    const personId = typeof body.personId === 'number' && Number.isFinite(body.personId)
      ? body.personId
      : null;

    if (!eventId || !validEventType(eventType) || !validRole(role)) {
      return NextResponse.json({ error: 'Demande de relance invalide' }, { status: 400 });
    }

    const db = await getDb();
    const snapshot = await getPlanningEventSnapshot(db, eventType, eventId);
    if (!snapshot) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });

    const sent = await sendManualAssignmentReminder(db, snapshot, role, personId);
    if (sent === 0) {
      return NextResponse.json(
        { error: 'Aucune affectation en attente à relancer sur un événement publié' },
        { status: 409 },
      );
    }

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'PlanningReminder',
      entityId: `${eventType}:${eventId}:${role}`,
      action: 'manual-reminder',
      before: null,
      after: { sent, personId },
    });

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error('Manual planning reminder failed:', error);
    return NextResponse.json({ error: 'Impossible d’envoyer la relance' }, { status: 500 });
  }
}
