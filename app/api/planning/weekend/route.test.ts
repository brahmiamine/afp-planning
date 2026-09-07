import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { weekendWindow } from '@/lib/planning/weekend';
import { POST as createEntrainement } from '@/app/api/entrainements/route';
import { GET } from './route';

const dbAvailable = await isDbAvailable();

function authedRequest(token: string) {
  return new NextRequest('http://localhost/api/planning/weekend', {
    headers: { cookie: `session_token=${token}` },
  });
}

function frenchDate(timestampMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(new Date(timestampMs));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

describe.skipIf(!dbAvailable)('GET /api/planning/weekend (issue #155)', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await GET(new NextRequest('http://localhost/api/planning/weekend'));
    expect(response.status).toBe(401);
  });

  it('lists an entrainement scheduled this upcoming weekend', async () => {
    // Club isolé : la vue week-end scanne tous les événements live du club sur la fenêtre.
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    let createdId: string | null = null;
    try {
      // Saturday just after `start` (00:00) so it always lands inside the window whatever
      // the club's configured time zone (Europe/Paris by default).
      const { start } = weekendWindow(Date.now(), 'Europe/Paris');
      const date = frenchDate(start + 3 * 60 * 60 * 1000, 'Europe/Paris');

      const createResponse = await createEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${admin.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time: '10:00', lieu: 'Terrain test', categorie: 'U13', encadrants: [] }),
      }));
      expect(createResponse.status).toBe(200);
      createdId = (await createResponse.json()).entrainement.id as string;

      const response = await GET(authedRequest(admin.token));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.items.some((item: { eventId: string }) => item.eventId === createdId)).toBe(true);
    } finally {
      if (createdId) {
        const db = await getDb();
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await admin.cleanup();
    }
  });
});
