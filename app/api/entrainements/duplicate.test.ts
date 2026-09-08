import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { POST } from './route';

const dbAvailable = await isDbAvailable();

function createRequest(body: unknown, token: string) {
  return new NextRequest('http://localhost/api/entrainements', {
    method: 'POST',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('duplicating an entrainement via POST /api/entrainements (issue #188)', () => {
  it('creates an independent draft, resetting publication status and assignment responses', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let originalId: string | null = null;
    let duplicateId: string | null = null;

    try {
      const originalResponse = await POST(createRequest({
        date: '20/09/2026',
        time: '10:00',
        lieu: 'Terrain A',
        categorie: 'U13',
        encadrants: [{ nom: 'Coach Original', personId: 999, status: 'accepted' }],
      }, token));
      expect(originalResponse.status).toBe(200);
      const original = (await originalResponse.json()).entrainement;
      originalId = original.id;

      // EventCardDrag.handleDuplicate n'envoie que nom/personId, jamais le statut de
      // publication de l'original ni le statut de réponse des personnes affectées.
      const duplicateResponse = await POST(createRequest({
        date: original.date,
        time: original.time,
        durationMinutes: original.durationMinutes,
        lieu: original.lieu,
        categorie: original.categorie,
        encadrants: (original.encadrants ?? []).map((contact: { nom: string; personId?: number }) => ({
          nom: contact.nom,
          personId: contact.personId,
        })),
      }, token));
      expect(duplicateResponse.status).toBe(200);
      const duplicate = (await duplicateResponse.json()).entrainement;
      duplicateId = duplicate.id;

      expect(duplicate.id).not.toBe(originalId);
      expect(duplicate.planningStatus).toBe('draft');
      expect(duplicate.lieu).toBe('Terrain A');
      expect(duplicate.categorie).toBe('U13');
      expect(duplicate.encadrants).toHaveLength(1);
      // La structure d'affectation (qui) est reprise, mais pas la réponse individuelle.
      expect(duplicate.encadrants[0]).toMatchObject({ nom: 'Coach Original', status: 'pending' });
      expect(duplicate.encadrants[0].respondedAt).toBeUndefined();
    } finally {
      const db = await getDb();
      for (const id of [originalId, duplicateId]) {
        if (!id) continue;
        await db.getRepository('Entrainement').delete({ id });
        await db.getRepository('MatchAuditLog').delete({ entityId: id });
      }
      await cleanup();
    }
  });
});
