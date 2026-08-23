import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { getDb } from '@/lib/db';
import type {
  EntrainementEntity,
  MatchAmicalEntity,
  MatchOfficialEntity,
  PlateauEntity,
} from '@/lib/db/schemas';
import { logAuditEntry } from '@/lib/db/audit-log';
import {
  canManagePlanningEventWorkspace,
  canReadPlanningEventWorkspace,
} from '@/lib/planning/event-access';
import {
  getPlanningEventSnapshot,
  savePlanningPublication,
  type PlanningEventType,
} from '@/lib/planning/event-store';
import { applyPlanningEventUpdate } from '@/lib/planning/event-update';
import type { Entrainement, Match, Plateau } from '@/types/match';

function validEventType(value: string): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

async function resolveParams(
  params: Promise<{ eventType: string; eventId: string }> | { eventType: string; eventId: string },
) {
  return params instanceof Promise ? await params : params;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventType: string; eventId: string }> | { eventType: string; eventId: string } },
) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  const resolved = await resolveParams(params);
  if (!validEventType(resolved.eventType) || !resolved.eventId) {
    return NextResponse.json({ error: 'Événement invalide' }, { status: 400 });
  }

  const db = await getDb();
  const snapshot = await getPlanningEventSnapshot(db, resolved.eventType, resolved.eventId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });
  }
  if (!canReadPlanningEventWorkspace(auth.user, snapshot)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  return NextResponse.json({
    ...snapshot,
    canManage: canManagePlanningEventWorkspace(auth.user),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventType: string; eventId: string }> | { eventType: string; eventId: string } },
) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  const resolved = await resolveParams(params);
  if (!validEventType(resolved.eventType) || !resolved.eventId) {
    return NextResponse.json({ error: 'Événement invalide' }, { status: 400 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const db = await getDb();
    const snapshot = await getPlanningEventSnapshot(db, resolved.eventType, resolved.eventId);
    if (!snapshot) {
      return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });
    }

    const before = snapshot.event as unknown as Record<string, unknown>;
    let updated = applyPlanningEventUpdate(resolved.eventType, snapshot.event, body);

    if (
      (resolved.eventType === 'entrainement' || resolved.eventType === 'plateau')
      && snapshot.planningStatus === 'published'
    ) {
      updated = {
        ...updated,
        planningStatus: 'modified',
        modifiedAfterPublishAt: new Date().toISOString(),
      } as Entrainement | Plateau;
    }

    await db.transaction(async (manager) => {
      if (resolved.eventType === 'officiel') {
        const repo = manager.getRepository<MatchOfficialEntity>('MatchOfficial');
        const row = await repo.findOne({
          where: { id: resolved.eventId, clubId: auth.user.clubId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!row) throw new Error('Événement introuvable');
        const currentRevision = Number((row.payload as Record<string, unknown>).planningRevision ?? 0);
        const payload = { ...(updated as Match), planningRevision: currentRevision + 1 };
        await repo.save({ ...row, date: payload.date, time: payload.time, payload: payload as unknown as Record<string, unknown> });
        return;
      }

      if (resolved.eventType === 'amical') {
        const repo = manager.getRepository<MatchAmicalEntity>('MatchAmical');
        const row = await repo.findOne({
          where: { id: resolved.eventId, clubId: auth.user.clubId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!row) throw new Error('Événement introuvable');
        const currentRevision = Number((row.payload as Record<string, unknown>).planningRevision ?? 0);
        const payload = { ...(updated as Match), planningRevision: currentRevision + 1 };
        await repo.save({ ...row, date: payload.date, time: payload.time, payload: payload as unknown as Record<string, unknown> });
        return;
      }

      if (resolved.eventType === 'entrainement') {
        const repo = manager.getRepository<EntrainementEntity>('Entrainement');
        const row = await repo.findOne({
          where: { id: resolved.eventId, clubId: auth.user.clubId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!row) throw new Error('Événement introuvable');
        const currentRevision = Number((row.payload as Record<string, unknown>).planningRevision ?? 0);
        const payload = { ...(updated as Entrainement), planningRevision: currentRevision + 1 };
        await repo.save({ ...row, date: payload.date, time: payload.time, payload: payload as unknown as Record<string, unknown> });
        return;
      }

      const repo = manager.getRepository<PlateauEntity>('Plateau');
      const row = await repo.findOne({
        where: { id: resolved.eventId, clubId: auth.user.clubId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new Error('Événement introuvable');
      const currentRevision = Number((row.payload as Record<string, unknown>).planningRevision ?? 0);
      const payload = { ...(updated as Plateau), planningRevision: currentRevision + 1 };
      await repo.save({ ...row, date: payload.date, time: payload.time, payload: payload as unknown as Record<string, unknown> });
    });

    if (
      (resolved.eventType === 'officiel' || resolved.eventType === 'amical')
      && snapshot.planningStatus === 'published'
    ) {
      await savePlanningPublication(db, snapshot, {
        planningStatus: 'modified',
        modifiedAfterPublishAt: new Date().toISOString(),
      });
    }

    const refreshed = await getPlanningEventSnapshot(db, resolved.eventType, resolved.eventId);
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'PlanningEvent',
      entityId: `${resolved.eventType}:${resolved.eventId}`,
      action: 'update',
      before,
      after: refreshed?.event as unknown as Record<string, unknown> ?? null,
    });

    return NextResponse.json({
      success: true,
      event: refreshed,
    });
  } catch (error) {
    console.error('Planning event update failed:', error);
    return NextResponse.json({ error: 'Impossible de modifier cet événement' }, { status: 500 });
  }
}
