import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { POST as createEntrainement } from '@/app/api/entrainements/route';
import { POST } from './route';

const dbAvailable = await isDbAvailable();

function publicationRequest(body: unknown, token: string) {
  return new NextRequest('http://localhost/api/planning/publication', {
    method: 'POST',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('POST /api/planning/publication (issue #155)', () => {
  it('rejects an invalid action', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await POST(publicationRequest({ eventId: 'x', eventType: 'entrainement', action: 'nope' }, token));
      expect(response.status).toBe(400);
    } finally {
      await cleanup();
    }
  });

  it('returns 404 for an unknown event', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await POST(publicationRequest({ eventId: 'does-not-exist', eventType: 'entrainement', action: 'cancel' }, token));
      expect(response.status).toBe(404);
    } finally {
      await cleanup();
    }
  });

  it('cancels then reopens an event', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let createdId: string | null = null;
    try {
      const createResponse = await createEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '20/09/2026', time: '10:00', lieu: 'Terrain test', categorie: 'U13', encadrants: [] }),
      }));
      createdId = (await createResponse.json()).entrainement.id as string;

      const cancelResponse = await POST(publicationRequest({
        eventId: createdId,
        eventType: 'entrainement',
        action: 'cancel',
        reason: 'Terrain indisponible',
      }, token));
      expect(cancelResponse.status).toBe(200);
      expect((await cancelResponse.json()).planningStatus).toBe('cancelled');

      const db = await getDb();
      const cancelledRow = await db.getRepository('Entrainement').findOneBy({ id: createdId });
      expect((cancelledRow?.payload as { cancellationReason?: string })?.cancellationReason).toBe('Terrain indisponible');

      const reopenResponse = await POST(publicationRequest({ eventId: createdId, eventType: 'entrainement', action: 'reopen' }, token));
      expect(reopenResponse.status).toBe(200);
      expect((await reopenResponse.json()).planningStatus).toBe('draft');

      const reopenedRow = await db.getRepository('Entrainement').findOneBy({ id: createdId });
      expect((reopenedRow?.payload as { cancellationReason?: string | null })?.cancellationReason).toBeNull();
    } finally {
      if (createdId) {
        const db = await getDb();
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: `entrainement:${createdId}` });
      }
      await cleanup();
    }
  });
});
