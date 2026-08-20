import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import type { AccompagnateurEntity, EncadrantEntity, OfficielEntity } from '@/lib/db/schemas';
import { buildAssignmentSuggestions } from '@/lib/planning/assignment-suggestions';
import { enrichAssignmentContacts, notifyAssignmentChanges } from '@/lib/planning/assignment-contacts';
import {
  getPlanningEventSnapshot,
  saveRoleAssignments,
  type PlanningEventType,
  type PlanningRole,
} from '@/lib/planning/event-store';
import {
  deletePlanningRecord,
  listPlanningRecords,
  savePlanningRecord,
} from '@/lib/planning/records';
import type { PersonType } from '@/types/match';

interface WaitlistPayload {
  role: PlanningRole;
  personType: PersonType;
  personId: number;
  nom: string;
  telephone: string | null;
  rank: number;
  addedAt: string;
}

function validEventType(value: unknown): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

function validRole(value: unknown): value is PlanningRole {
  return value === 'arbitre' || value === 'encadrant' || value === 'accompagnateur';
}

function personTypeForRole(role: PlanningRole): PersonType {
  if (role === 'arbitre') return 'officiel';
  if (role === 'encadrant') return 'encadrant';
  return 'accompagnateur';
}

async function findPerson(db: Awaited<ReturnType<typeof getDb>>, personType: PersonType, personId: number) {
  if (personType === 'officiel') return db.getRepository<OfficielEntity>('Officiel').findOneBy({ id: personId });
  if (personType === 'encadrant') return db.getRepository<EncadrantEntity>('Encadrant').findOneBy({ id: personId });
  return db.getRepository<AccompagnateurEntity>('Accompagnateur').findOneBy({ id: personId });
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  const url = new URL(request.url);
  const eventType = url.searchParams.get('eventType');
  const eventId = url.searchParams.get('eventId')?.trim();
  const role = url.searchParams.get('role');
  if (!eventId || !validEventType(eventType) || !validRole(role)) {
    return NextResponse.json({ error: 'Filtre de liste d’attente invalide' }, { status: 400 });
  }
  const db = await getDb();
  const records = await listPlanningRecords<WaitlistPayload>(db, { kind: 'waitlist', eventType, eventId }, 100);
  const items = records.filter((record) => record.payload.role === role).sort((a, b) => a.payload.rank - b.payload.rank);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const action = body.action === 'promote' ? 'promote' : 'add';
    const db = await getDb();

    if (action === 'promote') {
      const recordId = typeof body.recordId === 'string' ? body.recordId : '';
      const records = await listPlanningRecords<WaitlistPayload>(db, { kind: 'waitlist' }, 1000);
      const record = records.find((item) => item.id === recordId);
      if (!record || !record.eventType || !record.eventId) {
        return NextResponse.json({ error: 'Candidat de remplacement introuvable' }, { status: 404 });
      }
      if (!validEventType(record.eventType) || !validRole(record.payload.role)) {
        return NextResponse.json({ error: 'Liste d’attente invalide' }, { status: 409 });
      }

      const snapshot = await getPlanningEventSnapshot(db, record.eventType, record.eventId);
      if (!snapshot) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });
      const suggestions = await buildAssignmentSuggestions(db, snapshot, record.payload.role, 20);
      const candidate = suggestions.find((item) => item.personId === record.payload.personId && item.personType === record.payload.personType);
      if (!candidate) {
        return NextResponse.json({ error: 'Ce candidat n’est plus disponible ou présente un conflit' }, { status: 409 });
      }

      const before = snapshot.assignments[record.payload.role];
      const next = await enrichAssignmentContacts(db, [
        ...before,
        {
          nom: candidate.nom,
          numero: candidate.telephone ?? '',
          personId: candidate.personId,
          personType: candidate.personType,
          status: 'pending',
          assignedAt: new Date().toISOString(),
        },
      ], candidate.personType, before);
      await saveRoleAssignments(db, snapshot, record.payload.role, next);
      await deletePlanningRecord(db, record.id);
      await notifyAssignmentChanges(db, before, next, {
        eventType: record.eventType,
        eventId: record.eventId,
        roleLabel: record.payload.role,
        eventLabel: snapshot.title,
        date: snapshot.date,
        time: snapshot.time,
      });
      await logAuditEntry(db, {
        user: auth.user,
        entityType: 'PlanningAssignment',
        entityId: `${record.eventType}:${record.eventId}:${record.payload.role}`,
        action: 'auto-assign',
        before: { waitlist: record.payload, contacts: before },
        after: { promoted: candidate, contacts: next },
      });
      return NextResponse.json({ success: true, promoted: candidate });
    }

    const eventType = body.eventType;
    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const role = body.role;
    const personId = Number(body.personId);
    if (!eventId || !validEventType(eventType) || !validRole(role) || !Number.isInteger(personId) || personId <= 0) {
      return NextResponse.json({ error: 'Candidat de liste d’attente invalide' }, { status: 400 });
    }
    const expectedPersonType = personTypeForRole(role);
    const person = await findPerson(db, expectedPersonType, personId);
    if (!person) return NextResponse.json({ error: 'Personne introuvable' }, { status: 404 });
    const snapshot = await getPlanningEventSnapshot(db, eventType, eventId);
    if (!snapshot) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });

    const existing = await listPlanningRecords<WaitlistPayload>(db, { kind: 'waitlist', eventType, eventId }, 100);
    const sameRole = existing.filter((record) => record.payload.role === role);
    const id = `waitlist:${eventType}:${eventId}:${role}:${expectedPersonType}:${personId}`;
    const payload: WaitlistPayload = {
      role,
      personType: expectedPersonType,
      personId,
      nom: person.nom,
      telephone: person.telephone,
      rank: sameRole.length + 1,
      addedAt: new Date().toISOString(),
    };
    await savePlanningRecord(db, { id, kind: 'waitlist', eventType, eventId, personType: expectedPersonType, personId, payload });
    return NextResponse.json({ success: true, item: { id, ...payload } });
  } catch (error) {
    console.error('Planning waitlist failed:', error);
    return NextResponse.json({ error: 'Impossible de modifier la liste d’attente' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
  const db = await getDb();
  const deleted = await deletePlanningRecord(db, id);
  return deleted
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 });
}
