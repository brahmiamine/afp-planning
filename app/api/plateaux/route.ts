import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { PlateauxData, Plateau } from '@/types/match';
import { groupMatchesByDate } from '@/lib/db/helpers';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';
import { enrichAssignmentContacts, notifyAssignmentChanges } from '@/lib/planning/assignment-contacts';
import { notifyContact } from '@/lib/notifications/service';
import { activeContacts, isVisiblePublicationStatus, normalizePlanningStatus } from '@/lib/planning/p0-rules';
import { archivePlanningEvent } from '@/lib/planning/event-lifecycle';
import { PlanningConcurrencyError, saveBasePlanningEventOptimistically } from '@/lib/planning/event-store';
import { isPlanningFeatureEnabled } from '@/lib/settings-store';
import { PlanningValidationError, validateSimpleEventAssignments } from '@/lib/planning/validation';

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const db = await getDb();
    const rows = await db.getRepository('Plateau').find();
    const plateaux = rows
      .map((row) => row.payload as unknown as Plateau)
      .filter((item) => Boolean(item?.id));
    const data: PlateauxData = { plateaux: groupMatchesByDate(plateaux) };
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading plateaux from DB:', error);
    return NextResponse.json({ error: 'Failed to load plateaux' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const input: Omit<Plateau, 'id'> = await request.json();
    const id = `plateau-${input.date.replace(/\//g, '-')}-${input.time.replace(':', '-')}-${Date.now()}`;
    const db = await getDb();
    const newPlateau: Plateau = {
      ...input,
      id,
      type: 'plateau',
      durationMinutes: input.durationMinutes ?? 120,
      planningStatus: 'draft',
      encadrants: await enrichAssignmentContacts(db, input.encadrants, 'encadrant'),
    };
    if (await isPlanningFeatureEnabled(db, 'assignmentValidation')) {
      const violations = await validateSimpleEventAssignments(db, newPlateau);
      if (violations.length) throw new PlanningValidationError('Une ou plusieurs affectations sont invalides.', violations);
    }

    await db.getRepository('Plateau').save({
      id,
      date: newPlateau.date,
      time: newPlateau.time,
      payload: newPlateau as unknown as Record<string, unknown>,
    });

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'Plateau',
      entityId: id,
      action: 'create',
      before: null,
      after: newPlateau as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, plateau: newPlateau });
  } catch (error) {
    if (error instanceof PlanningValidationError) return NextResponse.json({ error: error.message, violations: error.details }, { status: 409 });
    console.error('Error saving plateau:', error);
    return NextResponse.json({ error: 'Failed to save plateau' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const { id, date, ...updatedPlateau } = await request.json();
    const db = await getDb();
    const repo = db.getRepository('Plateau');
    const row = await repo.findOneBy({ id });
    if (!row) return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });

    const currentPayload = row.payload as unknown as Plateau;
    const currentStatus = normalizePlanningStatus(currentPayload.planningStatus);
    const scheduleChanged = currentPayload.date !== (date || currentPayload.date)
      || currentPayload.time !== (updatedPlateau.time ?? currentPayload.time)
      || currentPayload.lieu !== (updatedPlateau.lieu ?? currentPayload.lieu);
    const nextStatus = scheduleChanged && isVisiblePublicationStatus(currentStatus) ? 'modified' : currentStatus;

    const nextPayload: Plateau = {
      ...currentPayload,
      ...updatedPlateau,
      id,
      date: date || currentPayload.date,
      type: 'plateau',
      planningStatus: nextStatus,
      ...(nextStatus === 'modified' ? { modifiedAfterPublishAt: new Date().toISOString() } : {}),
      durationMinutes: typeof updatedPlateau.durationMinutes === 'number'
        ? updatedPlateau.durationMinutes
        : currentPayload.durationMinutes ?? 120,
      encadrants: await enrichAssignmentContacts(
        db,
        updatedPlateau.encadrants ?? currentPayload.encadrants,
        'encadrant',
        currentPayload.encadrants,
      ),
    };
    if (await isPlanningFeatureEnabled(db, 'assignmentValidation')) {
      const violations = await validateSimpleEventAssignments(db, nextPayload);
      if (violations.length) throw new PlanningValidationError('Une ou plusieurs affectations sont invalides.', violations);
    }

    const savedPayload = await saveBasePlanningEventOptimistically(
      db, 'plateau', id, nextPayload, currentPayload.planningRevision ?? 0,
    );

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'Plateau',
      entityId: id,
      action: 'update',
      before: currentPayload as unknown as Record<string, unknown>,
      after: savedPayload as unknown as Record<string, unknown>,
    });

    if (isVisiblePublicationStatus(currentStatus)) {
      await notifyAssignmentChanges(db, currentPayload.encadrants, nextPayload.encadrants, {
        eventType: 'plateau',
        eventId: id,
        roleLabel: 'Encadrant',
        eventLabel: nextPayload.categories?.length ? `Plateau ${nextPayload.categories.join(', ')}` : 'Plateau',
        date: nextPayload.date,
        time: nextPayload.time,
      });

      if (scheduleChanged) {
        await Promise.all(activeContacts(nextPayload.encadrants).map((contact) => notifyContact(db, contact, {
          type: 'event-updated',
          title: 'Planning modifié',
          message: `Plateau déplacé/modifié — ${nextPayload.date} à ${nextPayload.time}, ${nextPayload.lieu}.`,
          eventType: 'plateau',
          eventId: id,
        })));
      }
    }

    return NextResponse.json({ success: true, plateau: savedPayload });
  } catch (error) {
    if (error instanceof PlanningValidationError) return NextResponse.json({ error: error.message, violations: error.details }, { status: 409 });
    if (error instanceof PlanningConcurrencyError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Error updating plateau:', error);
    return NextResponse.json({ error: 'Failed to update plateau' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const db = await getDb();
    const repo = db.getRepository('Plateau');
    const row = await repo.findOneBy({ id });
    if (!row) return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });

    const payload = row.payload as unknown as Plateau;
    if (isVisiblePublicationStatus(normalizePlanningStatus(payload.planningStatus))) {
      await Promise.all(activeContacts(payload.encadrants).map((contact) => notifyContact(db, contact, {
        type: 'event-cancelled',
        title: 'Événement supprimé',
        message: `Le plateau du ${payload.date} à ${payload.time} a été supprimé.`,
        eventType: 'plateau',
        eventId: id,
      })));
    }

    await archivePlanningEvent(db, 'plateau', id, auth.user.id, auth.user.clubId);
    await repo.remove(row);
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'Plateau',
      entityId: id,
      action: 'delete',
      before: payload as unknown as Record<string, unknown>,
      after: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting plateau:', error);
    return NextResponse.json({ error: 'Failed to delete plateau' }, { status: 500 });
  }
}
