import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { MatchesAmicauxData, Match } from '@/types/match';
import { groupMatchesByDate } from '@/lib/db/helpers';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { enrichAssignmentContacts } from '@/lib/planning/assignment-contacts';
import { isVisiblePublicationStatus, normalizePlanningStatus } from '@/lib/planning/p0-rules';
import { archivePlanningEvent, isPlanningEventCurrentlyPublished } from '@/lib/planning/event-lifecycle';
import { applyPlanningPublicationAction } from '@/lib/planning/publication-service';
import {
  getPlanningEventSnapshot,
  PlanningConcurrencyError,
  saveBasePlanningEventOptimistically,
  saveMatchExtrasOptimistically,
} from '@/lib/planning/event-store';
import { setCurrentClubId } from '@/lib/auth/club-context';
import {
  parseMatchExtrasPayload,
  parseMatchPayload,
  serializeMatchExtrasPayload,
  serializeMatchPayload,
} from '@/lib/db/planning-payload-codecs';
import { BodyValidator, parseJsonBody, RequestValidationError } from '@/lib/validation/request';

const VENUE_VALUES = ['domicile', 'extérieur'] as const;

async function getMatchExtras(id: string, clubId: string): Promise<MatchExtras | null> {
  const db = await getDb();
  const row = await db.getRepository('MatchExtra').findOneBy({ matchId: id, clubId });
  return row ? parseMatchExtrasPayload(row.payload, id) : null;
}


export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const db = await getDb();
    const rows = await db.getRepository('MatchAmical').findBy({ clubId: auth.user.clubId });
    const matches = rows
      .map((row) => parseMatchPayload(row.payload, 'MatchAmical', { id: row.id, type: 'amical' }))
      .filter((item) => Boolean(item?.id));
    const matchesData: MatchesAmicauxData = { matches: groupMatchesByDate(matches) };
    return NextResponse.json(matchesData);
  } catch (error) {
    console.error('Error reading matches amicaux from DB:', error);
    return NextResponse.json({ error: 'Failed to load matches amicaux' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const body = parseJsonBody(await request.json());
    const v = new BodyValidator(body);
    v.date('date');
    v.time('time');
    v.string('competition', { maxLength: 128 });
    v.string('categorie', { required: false, maxLength: 64 });
    v.string('localTeam', { maxLength: 128 });
    v.string('awayTeam', { maxLength: 128 });
    v.enum('venue', VENUE_VALUES);
    v.time('horaireRendezVous', { required: false });
    v.number('durationMinutes', { required: false, min: 1, max: 1440 });
    v.boolean('confirmed', { required: false });
    v.assignmentContacts('arbitreTouche');
    v.assignmentContacts('contactEncadrants');
    v.assignmentContacts('contactAccompagnateur');
    v.throwIfInvalid();

    const {
      confirmed,
      arbitreTouche,
      contactEncadrants,
      contactAccompagnateur,
      ...matchPayload
    } = body;
    // Les extras ont leur propre source de vérité (MatchExtra) : ne jamais les copier dans
    // le payload du match, sinon une modification ultérieure des extras laisserait une
    // ancienne affectation sérialisée dans MatchAmical.
    const match: Match = matchPayload as unknown as Match;
    if (!match.id) {
      match.id = `amical-${match.date.replace(/\//g, '-')}-${match.time.replace(':', '-')}-${Date.now()}`;
    }
    match.type = 'amical';
    match.durationMinutes = match.durationMinutes ?? 90;

    const db = await getDb();
    // Les extras (arbitre/encadrant/accompagnateur touchés) sont acceptés dès la création :
    // le match et ses extras s'écrivent en une seule transaction plutôt qu'en deux requêtes
    // client séparées, dont la seconde pouvait échouer après que le match soit déjà enregistré
    // (issue #208).
    const extras: MatchExtras = {
      id: match.id,
      planningStatus: 'draft',
      confirmed: confirmed === true || confirmed === false ? confirmed : undefined,
      arbitreTouche: await enrichAssignmentContacts(db, auth.user.clubId, arbitreTouche, 'officiel'),
      contactEncadrants: await enrichAssignmentContacts(db, auth.user.clubId, contactEncadrants, 'encadrant'),
      contactAccompagnateur: await enrichAssignmentContacts(db, auth.user.clubId, contactAccompagnateur, 'accompagnateur'),
    };

    await db.transaction(async (manager) => {
      await manager.getRepository('MatchAmical').save({
        id: match.id,
        clubId: auth.user.clubId,
        date: match.date,
        time: match.time || '',
        payload: serializeMatchPayload(match),
      });
      await manager.getRepository('MatchExtra').save({
        matchId: match.id,
        clubId: auth.user.clubId,
        payload: serializeMatchExtrasPayload(extras),
      });
    });

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'MatchAmical',
      entityId: match.id,
      action: 'create',
      before: null,
      after: { ...(match as unknown as Record<string, unknown>), ...extras, planningStatus: 'draft' },
    });

    return NextResponse.json({ success: true, match, extras, planningStatus: 'draft' });
  } catch (error) {
    if (error instanceof RequestValidationError) return NextResponse.json({ error: 'Requête invalide', details: error.issues }, { status: 400 });
    console.error('Error saving match amical:', error);
    return NextResponse.json({ error: 'Failed to save matches amicaux' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const body = parseJsonBody(await request.json());
    const v = new BodyValidator(body);
    v.string('id');
    v.date('date', { required: false });
    v.time('time', { required: false });
    v.string('competition', { required: false, maxLength: 128 });
    v.string('categorie', { required: false, maxLength: 64 });
    v.string('localTeam', { required: false, maxLength: 128 });
    v.string('awayTeam', { required: false, maxLength: 128 });
    v.enum('venue', VENUE_VALUES, { required: false });
    v.time('horaireRendezVous', { required: false });
    v.number('durationMinutes', { required: false, min: 1, max: 1440 });
    v.throwIfInvalid();

    const { id, date, ...updatedMatch } = body as { id: string; date?: string } & Record<string, unknown>;
    const db = await getDb();
    const repo = db.getRepository('MatchAmical');
    const row = await repo.findOneBy({ id, clubId: auth.user.clubId });
    if (!row) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

    const currentPayload = parseMatchPayload(row.payload, 'MatchAmical', { id, type: 'amical' });
    const nextPayload: Match = {
      ...currentPayload,
      ...updatedMatch,
      id,
      date: date || currentPayload.date,
      type: 'amical',
      durationMinutes: typeof updatedMatch.durationMinutes === 'number'
        ? updatedMatch.durationMinutes
        : currentPayload.durationMinutes ?? 90,
    };

    const savedPayload = await saveBasePlanningEventOptimistically(
      db, 'amical', id, nextPayload, currentPayload.planningRevision ?? 0,
    );

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'MatchAmical',
      entityId: id,
      action: 'update',
      before: currentPayload as unknown as Record<string, unknown>,
      after: savedPayload as unknown as Record<string, unknown>,
    });

    const scheduleChanged = currentPayload.date !== nextPayload.date
      || currentPayload.time !== nextPayload.time
      || currentPayload.details?.stadium !== nextPayload.details?.stadium;
    if (scheduleChanged) {
      const extras = await getMatchExtras(id, auth.user.clubId);
      const status = normalizePlanningStatus(extras?.planningStatus);
      if (isVisiblePublicationStatus(status)) {
        const nextExtras: MatchExtras = {
          ...(extras ?? { id }),
          planningStatus: 'modified',
          modifiedAfterPublishAt: new Date().toISOString(),
        };
        await saveMatchExtrasOptimistically(db, id, nextExtras, extras?.planningRevision ?? 0);
      }
    }

    return NextResponse.json({ success: true, match: savedPayload });
  } catch (error) {
    if (error instanceof RequestValidationError) return NextResponse.json({ error: 'Requête invalide', details: error.issues }, { status: 400 });
    if (error instanceof PlanningConcurrencyError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Error updating match amical:', error);
    return NextResponse.json({ error: 'Failed to update match amical' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const db = await getDb();
    const repo = db.getRepository('MatchAmical');
    const row = await repo.findOneBy({ id, clubId: auth.user.clubId });
    if (!row) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

    const payload = parseMatchPayload(row.payload, 'MatchAmical', { id, type: 'amical' });
    const snapshot = await getPlanningEventSnapshot(db, 'amical', id);
    const alreadyPublished = await isPlanningEventCurrentlyPublished(
      db,
      auth.user.clubId,
      'amical',
      id,
    );

    // Un événement déjà communiqué reste inchangé dans le snapshot visible aux utilisateurs.
    // Le DELETE prépare uniquement son annulation dans le brouillon ; la publication globale
    // propagera ensuite l'annulation et les notifications de façon cohérente.
    if (alreadyPublished && snapshot) {
      const planningStatus = await applyPlanningPublicationAction(
        db,
        auth.user,
        snapshot,
        'cancel',
        'Suppression préparée depuis le planning',
      );
      return NextResponse.json({ success: true, deferred: true, planningStatus });
    }

    await archivePlanningEvent(db, 'amical', id, auth.user.id, auth.user.clubId);
    await repo.remove(row);
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'MatchAmical',
      entityId: id,
      action: 'delete',
      before: payload as unknown as Record<string, unknown>,
      after: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting match amical:', error);
    return NextResponse.json({ error: 'Failed to delete match amical' }, { status: 500 });
  }
}
