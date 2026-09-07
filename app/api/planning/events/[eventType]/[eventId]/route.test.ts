import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { POST as createEntrainement } from '@/app/api/entrainements/route';
import { PUT } from './route';

const dbAvailable = await isDbAvailable();

function putRequest(eventType: string, eventId: string, body: unknown, token: string) {
  return new NextRequest(`http://localhost/api/planning/events/${eventType}/${eventId}`, {
    method: 'PUT',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('PUT /api/planning/events/[eventType]/[eventId] (issue #163)', () => {
  it('rejects a stale expectedRevision with 409 instead of silently overwriting a concurrent edit', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let createdId: string | null = null;
    try {
      const db = await getDb();

      const createResponse = await createEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '20/09/2026', time: '10:00', lieu: 'Terrain test', categorie: 'U13', encadrants: [] }),
      }));
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      createdId = created.entrainement.id as string;

      // Première édition avec la révision de création (0) : doit réussir et faire passer la révision à 1.
      const firstEdit = await PUT(
        putRequest('entrainement', createdId, { lieu: 'Terrain modifié une fois', expectedRevision: 0 }, token),
        { params: { eventType: 'entrainement', eventId: createdId } },
      );
      expect(firstEdit.status).toBe(200);

      // Un deuxième client qui a lu la même révision (0), sans savoir qu'elle a changé entre-temps,
      // doit être rejeté avec 409 plutôt que d'écraser silencieusement la première édition.
      const staleEdit = await PUT(
        putRequest('entrainement', createdId, { lieu: 'Écrasement concurrent', expectedRevision: 0 }, token),
        { params: { eventType: 'entrainement', eventId: createdId } },
      );
      expect(staleEdit.status).toBe(409);

      const row = await db.getRepository('Entrainement').findOneBy({ id: createdId });
      expect((row?.payload as { lieu?: string })?.lieu).toBe('Terrain modifié une fois');
    } finally {
      if (createdId) {
        const db = await getDb();
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await cleanup();
    }
  });
});
