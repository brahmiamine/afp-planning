import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { serializeMatchExtrasPayload } from '@/lib/db/planning-payload-codecs';
import { DELETE, GET, POST, PUT } from './route';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('/api/matches-amicaux (issue #128 payload codecs)', () => {
  it('couvre le cycle création/lecture/édition/suppression via les codecs versionnés', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let createdId: string | null = null;
    try {
      const createRequest = new NextRequest('http://localhost/api/matches-amicaux', {
        method: 'POST',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '20/09/2026',
          time: '15:00',
          competition: 'Amical',
          localTeam: 'AFP',
          awayTeam: 'Visiteur',
          venue: 'domicile',
          horaireRendezVous: '14:00',
          details: null,
          staff: null,
        }),
      });
      const createResponse = await POST(createRequest);
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      createdId = created.match?.id ?? null;
      expect(createdId).toBeTruthy();
      expect(created.match).toMatchObject({ localTeam: 'AFP', awayTeam: 'Visiteur' });
      expect(created.planningStatus).toBe('draft');

      // Le payload persisté doit être versionné, et la version ne doit pas fuiter dans l'API.
      const db = await getDb();
      const row = await db.getRepository('MatchAmical').findOneByOrFail({ id: createdId! });
      expect((row.payload as Record<string, unknown>).schemaVersion).toBe(1);

      const getRequest = new NextRequest('http://localhost/api/matches-amicaux', {
        headers: { cookie: `session_token=${token}` },
      });
      const getResponse = await GET(getRequest);
      expect(getResponse.status).toBe(200);
      const listed = await getResponse.json();
      const allMatches = Object.values(listed.matches ?? {}).flat() as Array<{ id: string; schemaVersion?: unknown }>;
      const found = allMatches.find((m) => m.id === createdId);
      expect(found).toBeTruthy();
      expect(found?.schemaVersion).toBeUndefined();

      const putRequest = new NextRequest('http://localhost/api/matches-amicaux', {
        method: 'PUT',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: createdId, awayTeam: 'Autre visiteur' }),
      });
      const putResponse = await PUT(putRequest);
      expect(putResponse.status).toBe(200);
      const updated = await putResponse.json();
      expect(updated.match).toMatchObject({ awayTeam: 'Autre visiteur', localTeam: 'AFP' });

      const deleteRequest = new NextRequest(`http://localhost/api/matches-amicaux?id=${createdId}`, {
        method: 'DELETE',
        headers: { cookie: `session_token=${token}` },
      });
      const deleteResponse = await DELETE(deleteRequest);
      expect(deleteResponse.status).toBe(200);
      const deleted = await deleteResponse.json();
      expect(deleted.success).toBe(true);
      createdId = null;
    } finally {
      if (createdId) {
        const db = await getDb();
        await db.getRepository('MatchAmical').delete({ id: createdId });
        await db.getRepository('MatchExtra').delete({ matchId: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await cleanup();
    }
  });

  it('isole les MatchExtra par clubId même quand deux clubs partagent le même matchId (issue #199)', async () => {
    const sharedId = `amical-shared-${Date.now()}-${randomBytes(4).toString('hex')}`;
    // "aaa-" trie avant "zzz-" dans l'index composite (clubId, matchId) : sans le filtre
    // clubId, un scan non scopé retrouverait cette ligne en premier.
    const otherClubId = `aaa-club-${randomBytes(4).toString('hex')}`;
    const myClubId = `zzz-club-${randomBytes(4).toString('hex')}`;

    const other = await createTestUserAndSession('admin', { clubId: otherClubId });
    const mine = await createTestUserAndSession('admin', { clubId: myClubId });

    try {
      const db = await getDb();

      const otherCreate = await POST(new NextRequest('http://localhost/api/matches-amicaux', {
        method: 'POST',
        headers: { cookie: `session_token=${other.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sharedId,
          date: '20/09/2026',
          time: '15:00',
          competition: 'Amical',
          localTeam: 'Club Other',
          awayTeam: 'Visiteur',
          venue: 'domicile',
          details: null,
          staff: null,
        }),
      }));
      expect(otherCreate.status).toBe(200);

      // Le match du club "other" est déjà publié et confirmé.
      await db.getRepository('MatchExtra').save({
        matchId: sharedId,
        clubId: otherClubId,
        payload: serializeMatchExtrasPayload({ id: sharedId, planningStatus: 'published', confirmed: true }),
      });

      const mineCreate = await POST(new NextRequest('http://localhost/api/matches-amicaux', {
        method: 'POST',
        headers: { cookie: `session_token=${mine.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sharedId,
          date: '21/09/2026',
          time: '16:00',
          competition: 'Amical',
          localTeam: 'Mon club',
          awayTeam: 'Autre visiteur',
          venue: 'domicile',
          details: null,
          staff: null,
        }),
      }));
      expect(mineCreate.status).toBe(200);

      // Modifier le stade du match "mine" (encore en brouillon) déclenche le chemin
      // scheduleChanged, qui doit lire/écrire uniquement les extras du club "mine".
      const putResponse = await PUT(new NextRequest('http://localhost/api/matches-amicaux', {
        method: 'PUT',
        headers: { cookie: `session_token=${mine.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sharedId, details: { stadium: 'Nouveau stade' } }),
      }));
      expect(putResponse.status).toBe(200);

      const mineExtra = await db.getRepository('MatchExtra').findOneByOrFail({ matchId: sharedId, clubId: myClubId });
      expect((mineExtra.payload as Record<string, unknown>).planningStatus).toBe('draft');
      expect((mineExtra.payload as Record<string, unknown>).confirmed).toBeUndefined();

      const otherExtra = await db.getRepository('MatchExtra').findOneByOrFail({ matchId: sharedId, clubId: otherClubId });
      expect((otherExtra.payload as Record<string, unknown>).planningStatus).toBe('published');
      expect((otherExtra.payload as Record<string, unknown>).confirmed).toBe(true);

      await db.getRepository('MatchAmical').delete({ id: sharedId, clubId: myClubId });
      await db.getRepository('MatchExtra').delete({ matchId: sharedId, clubId: myClubId });
      await db.getRepository('MatchAmical').delete({ id: sharedId, clubId: otherClubId });
      await db.getRepository('MatchExtra').delete({ matchId: sharedId, clubId: otherClubId });
    } finally {
      await other.cleanup();
      await mine.cleanup();
    }
  });

  it('enregistre le match et ses extras en une seule requête atomique (issue #208)', async () => {
    const { user, token, cleanup } = await createTestUserAndSession('admin', {}, ['encadrant']);
    let createdId: string | null = null;
    try {
      const createResponse = await POST(new NextRequest('http://localhost/api/matches-amicaux', {
        method: 'POST',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '20/09/2026',
          time: '15:00',
          competition: 'Amical',
          localTeam: 'AFP',
          awayTeam: 'Visiteur',
          venue: 'domicile',
          details: null,
          staff: null,
          confirmed: true,
          contactEncadrants: [{ nom: user.nom, numero: '', personId: user.id, personType: 'encadrant' }],
        }),
      }));
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      createdId = created.match?.id ?? null;
      expect(createdId).toBeTruthy();
      expect(created.extras.confirmed).toBe(true);
      expect(created.extras.contactEncadrants).toHaveLength(1);

      // Les extras sont bien la même transaction que le match, pas une seconde requête :
      // aucun follow-up n'est nécessaire pour les retrouver.
      const db = await getDb();
      const extraRow = await db.getRepository('MatchExtra').findOneByOrFail({ matchId: createdId!, clubId: user.clubId });
      const extraPayload = extraRow.payload as Record<string, unknown>;
      expect(extraPayload.confirmed).toBe(true);
      expect(extraPayload.contactEncadrants).toHaveLength(1);
    } finally {
      if (createdId) {
        const db = await getDb();
        await db.getRepository('MatchAmical').delete({ id: createdId, clubId: user.clubId });
        await db.getRepository('MatchExtra').delete({ matchId: createdId, clubId: user.clubId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await cleanup();
    }
  });
});
