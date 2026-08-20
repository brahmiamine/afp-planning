import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import {
  getPlanningEventSnapshot,
  saveRoleAssignments,
  type PlanningEventType,
  type PlanningRole,
} from '@/lib/planning/event-store';
import { eventEndTimestamp, markAttendance } from '@/lib/planning/p0-rules';
import type { AttendanceStatus } from '@/types/match';

function validEventType(value: unknown): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

function validRole(value: unknown): value is PlanningRole {
  return value === 'arbitre' || value === 'encadrant' || value === 'accompagnateur';
}

function validAttendance(value: unknown): value is Exclude<AttendanceStatus, 'unknown'> {
  return value === 'present' || value === 'excused' || value === 'absent' || value === 'replaced';
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const eventType = body.eventType;
    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const role = body.role;
    const status = body.status;
    const personId = typeof body.personId === 'number' && Number.isFinite(body.personId) ? body.personId : null;
    const personNom = typeof body.personNom === 'string' ? body.personNom.trim().toLowerCase() : '';

    if (!eventId || !validEventType(eventType) || !validRole(role) || !validAttendance(status)) {
      return NextResponse.json({ error: 'Présence invalide' }, { status: 400 });
    }
    if (personId === null && !personNom) {
      return NextResponse.json({ error: 'Personne requise' }, { status: 400 });
    }

    const db = await getDb();
    const snapshot = await getPlanningEventSnapshot(db, eventType, eventId);
    if (!snapshot) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });

    const eventEnd = eventEndTimestamp(snapshot.date, snapshot.time, snapshot.durationMinutes);
    if (eventEnd === null || eventEnd > Date.now()) {
      return NextResponse.json(
        { error: 'La présence ne peut être enregistrée qu’après la fin de l’événement' },
        { status: 409 },
      );
    }

    let changed = false;
    const before = snapshot.assignments[role];
    const next = before.map((contact) => {
      const matches = personId !== null
        ? contact.personId === personId
        : contact.nom.trim().toLowerCase() === personNom;
      if (!matches) return contact;
      changed = true;
      return markAttendance(contact, status);
    });

    if (!changed) {
      return NextResponse.json({ error: 'Affectation introuvable pour cette personne' }, { status: 404 });
    }

    await saveRoleAssignments(db, snapshot, role, next);
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'PlanningAttendance',
      entityId: `${eventType}:${eventId}:${role}`,
      action: 'attendance',
      before: { contacts: before },
      after: { contacts: next, status },
    });

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error('Attendance update failed:', error);
    return NextResponse.json({ error: 'Impossible d’enregistrer la présence' }, { status: 500 });
  }
}
