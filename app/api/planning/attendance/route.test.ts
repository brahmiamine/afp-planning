import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import { getPlanningEventSnapshot } from '@/lib/planning/event-store';
import { savePublishedPlanning } from '@/lib/planning/published-planning';
import { POST as createEntrainement } from '@/app/api/entrainements/route';
import { POST } from './route';

const dbAvailable = await isDbAvailable();

function attendanceRequest(body: unknown, token: string) {
  return new NextRequest('http://localhost/api/planning/attendance', {
    method: 'POST',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('POST /api/planning/attendance (issue #155 / #156)', () => {
  it('rejects recording attendance before the event has ended', async () => {
    // Club isolé : savePublishedPlanning réécrit le snapshot publié entier du club.
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const encadrant = await createTestUserAndSession('encadrant', { clubId });
    let createdId: string | null = null;
    try {
      const db = await getDb();
      const adminUser = await getSessionUser(admin.token);
      if (!adminUser) throw new Error('admin session introuvable');

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const date = `${String(futureDate.getDate()).padStart(2, '0')}/${String(futureDate.getMonth() + 1).padStart(2, '0')}/${futureDate.getFullYear()}`;

      const createResponse = await createEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${admin.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          time: '10:00',
          lieu: 'Terrain test',
          categorie: 'U13',
          encadrants: [{ nom: encadrant.user.nom, personId: encadrant.user.id, status: 'accepted' }],
        }),
      }));
      expect(createResponse.status).toBe(200);
      createdId = (await createResponse.json()).entrainement.id as string;

      // Le contexte club ambiant n'est fiable que pendant l'exécution d'une requête ; on le
      // fixe explicitement ici plutôt que de compter sur ce que le dernier appel de route a
      // laissé derrière lui.
      await runWithClubId(clubId, async () => {
        const liveSnapshot = await getPlanningEventSnapshot(db, 'entrainement', createdId!);
        if (!liveSnapshot) throw new Error('snapshot introuvable');
        await savePublishedPlanning(db, adminUser, [liveSnapshot]);
      });

      const response = await POST(attendanceRequest({
        eventType: 'entrainement',
        eventId: createdId,
        role: 'encadrant',
        status: 'present',
        personId: encadrant.user.id,
      }, admin.token));
      expect(response.status).toBe(409);
    } finally {
      const db = await getDb();
      if (createdId) {
        await db.query('DELETE FROM planning_records WHERE club_id = ? AND kind = ?', [admin.user.clubId, 'published-planning']);
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await encadrant.cleanup();
      await admin.cleanup();
    }
  });

  it('records attendance once the event is over', async () => {
    // Club isolé : savePublishedPlanning réécrit le snapshot publié entier du club.
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const encadrant = await createTestUserAndSession('encadrant', { clubId });
    let createdId: string | null = null;
    try {
      const db = await getDb();
      const adminUser = await getSessionUser(admin.token);
      if (!adminUser) throw new Error('admin session introuvable');

      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const date = `${String(pastDate.getDate()).padStart(2, '0')}/${String(pastDate.getMonth() + 1).padStart(2, '0')}/${pastDate.getFullYear()}`;

      const createResponse = await createEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${admin.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          time: '10:00',
          lieu: 'Terrain test',
          categorie: 'U13',
          encadrants: [{ nom: encadrant.user.nom, personId: encadrant.user.id, status: 'accepted' }],
        }),
      }));
      expect(createResponse.status).toBe(200);
      createdId = (await createResponse.json()).entrainement.id as string;

      // Le contexte club ambiant n'est fiable que pendant l'exécution d'une requête ; on le
      // fixe explicitement ici plutôt que de compter sur ce que le dernier appel de route a
      // laissé derrière lui.
      await runWithClubId(clubId, async () => {
        const liveSnapshot = await getPlanningEventSnapshot(db, 'entrainement', createdId!);
        if (!liveSnapshot) throw new Error('snapshot introuvable');
        await savePublishedPlanning(db, adminUser, [liveSnapshot]);
      });

      const response = await POST(attendanceRequest({
        eventType: 'entrainement',
        eventId: createdId,
        role: 'encadrant',
        status: 'present',
        personId: encadrant.user.id,
      }, admin.token));
      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe('present');
    } finally {
      const db = await getDb();
      if (createdId) {
        await db.query('DELETE FROM planning_records WHERE club_id = ? AND kind = ?', [admin.user.clubId, 'published-planning']);
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await encadrant.cleanup();
      await admin.cleanup();
    }
  });
});
