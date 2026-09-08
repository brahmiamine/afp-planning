import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { runWithClubId } from '@/lib/auth/club-context';
import { getPlanningEventSnapshot } from './event-store';
import type { Match } from '@/types/match';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('validation des payloads planning (issue #128)', () => {
  it('refuse un payload de match DB structurellement invalide au lieu de propager des undefined', async () => {
    const db = await getDb();
    const clubId = `codec-${randomBytes(5).toString('hex')}`;
    const id = `match-${randomBytes(5).toString('hex')}`;

    try {
      await db.getRepository('MatchOfficial').save({
        clubId,
        id,
        date: '20/09/2026',
        time: '15:00',
        payload: {
          id,
          type: 'officiel',
          date: '20/09/2026',
          time: '15:00',
          competition: 'Championnat',
          // localTeam / awayTeam / venue / horaireRendezVous volontairement absents.
        },
      });

      await expect(
        runWithClubId(clubId, () => getPlanningEventSnapshot(db, 'officiel', id)),
      ).rejects.toThrow('Payload MatchOfficial invalide');
    } finally {
      await db.getRepository('MatchOfficial').delete({ clubId, id });
      await db.getRepository('MatchExtra').delete({ clubId, matchId: id });
    }
  });

  it('continue de lire un payload legacy valide sans schemaVersion', async () => {
    const db = await getDb();
    const clubId = `codec-${randomBytes(5).toString('hex')}`;
    const id = `match-${randomBytes(5).toString('hex')}`;
    const legacy: Match = {
      id,
      type: 'officiel',
      date: '21/09/2026',
      time: '16:00',
      competition: 'Championnat',
      localTeam: 'AFP',
      awayTeam: 'Visiteur',
      venue: 'domicile',
      horaireRendezVous: '15:00',
      details: null,
      staff: null,
    };

    try {
      await db.getRepository('MatchOfficial').save({
        clubId,
        id,
        date: legacy.date,
        time: legacy.time,
        payload: legacy as unknown as Record<string, unknown>,
      });

      const snapshot = await runWithClubId(
        clubId,
        () => getPlanningEventSnapshot(db, 'officiel', id),
      );

      expect(snapshot?.eventId).toBe(id);
      expect(snapshot?.title).toBe('AFP – Visiteur');
      expect(snapshot?.revision).toBe(0);
    } finally {
      await db.getRepository('MatchOfficial').delete({ clubId, id });
      await db.getRepository('MatchExtra').delete({ clubId, matchId: id });
    }
  });

  it('refuse une révision MatchExtra corrompue au lieu de la convertir silencieusement en zéro', async () => {
    const db = await getDb();
    const clubId = `codec-${randomBytes(5).toString('hex')}`;
    const id = `match-${randomBytes(5).toString('hex')}`;
    const match: Match = {
      id,
      type: 'officiel',
      date: '22/09/2026',
      time: '18:00',
      competition: 'Championnat',
      localTeam: 'AFP',
      awayTeam: 'Visiteur',
      venue: 'domicile',
      horaireRendezVous: '17:00',
      details: null,
      staff: null,
    };

    try {
      await db.getRepository('MatchOfficial').save({
        clubId,
        id,
        date: match.date,
        time: match.time,
        payload: match as unknown as Record<string, unknown>,
      });
      await db.getRepository('MatchExtra').save({
        clubId,
        matchId: id,
        payload: { id, planningStatus: 'draft', planningRevision: 'corrompue' },
      });

      await expect(
        runWithClubId(clubId, () => getPlanningEventSnapshot(db, 'officiel', id)),
      ).rejects.toThrow('Payload MatchExtra invalide');
    } finally {
      await db.getRepository('MatchExtra').delete({ clubId, matchId: id });
      await db.getRepository('MatchOfficial').delete({ clubId, id });
    }
  });
});
