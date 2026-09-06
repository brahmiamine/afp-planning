import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { POST } from './route';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('/api/entrainements draft preparation (issue #47)', () => {
  it('enregistre un brouillon même avec un encadrant non encore relié au référentiel', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let createdId: string | null = null;
    try {
      const request = new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: {
          cookie: `session_token=${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: '20/09/2026',
          time: '10:00',
          lieu: 'Terrain test',
          categorie: 'U13',
          encadrants: [{ nom: 'Encadrant brouillon', numero: '' }],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const payload = await response.json();
      createdId = payload.entrainement?.id ?? null;
      expect(payload.entrainement).toMatchObject({
        planningStatus: 'draft',
        encadrants: [expect.objectContaining({ nom: 'Encadrant brouillon' })],
      });
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
