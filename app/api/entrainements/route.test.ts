import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { POST, PUT } from './route';

const dbAvailable = await isDbAvailable();

function jsonRequest(url: string, method: string, body: unknown, token: string) {
  return new NextRequest(url, {
    method,
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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

describe.skipIf(!dbAvailable)('POST/PUT /api/entrainements — validation du payload (issue #282)', () => {
  it('renvoie 400 avec un détail par champ pour un corps structurellement malformé', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await POST(jsonRequest('http://localhost/api/entrainements', 'POST', {
        date: '31/02/2026', // calendrier impossible
        time: 'not-a-time',
        // lieu manquant
        durationMinutes: 'ninety', // mauvais type
        encadrants: [{ numero: '' }], // nom manquant
      }, token));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Requête invalide');
      const fields = (body.details as Array<{ field: string }>).map((issue) => issue.field).sort();
      expect(fields).toEqual(['date', 'durationMinutes', 'encadrants[0].nom', 'lieu', 'time']);
    } finally {
      await cleanup();
    }
  });

  it('n’écrit jamais en base quand le payload est rejeté', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const db = await getDb();
      const before = await db.getRepository('Entrainement').count();

      const response = await POST(jsonRequest('http://localhost/api/entrainements', 'POST', {
        date: 'invalide',
        time: '10:00',
        lieu: 'Terrain test',
      }, token));
      expect(response.status).toBe(400);

      const after = await db.getRepository('Entrainement').count();
      expect(after).toBe(before);
    } finally {
      await cleanup();
    }
  });

  it('PUT accepte une mise à jour partielle mais rejette un champ fourni et invalide', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let createdId: string | null = null;
    try {
      const createResponse = await POST(jsonRequest('http://localhost/api/entrainements', 'POST', {
        date: '20/09/2026',
        time: '10:00',
        lieu: 'Terrain test',
      }, token));
      expect(createResponse.status).toBe(200);
      createdId = (await createResponse.json()).entrainement.id as string;

      // Champ unique modifié : les autres restent absents du corps, ce qui doit rester permis.
      const partialUpdate = await PUT(jsonRequest('http://localhost/api/entrainements', 'PUT', {
        id: createdId,
        lieu: 'Nouveau terrain',
      }, token));
      expect(partialUpdate.status).toBe(200);

      const invalidUpdate = await PUT(jsonRequest('http://localhost/api/entrainements', 'PUT', {
        id: createdId,
        time: 'midi',
      }, token));
      expect(invalidUpdate.status).toBe(400);
      const body = await invalidUpdate.json();
      expect(body.details).toEqual([{ field: 'time', message: 'doit être une heure valide au format hh:mm' }]);
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
