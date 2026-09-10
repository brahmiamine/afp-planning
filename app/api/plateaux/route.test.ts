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

describe.skipIf(!dbAvailable)('/api/plateaux draft preparation (issue #47)', () => {
  it('enregistre un brouillon même avec un encadrant non encore relié au référentiel', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let createdId: string | null = null;
    try {
      const request = new NextRequest('http://localhost/api/plateaux', {
        method: 'POST',
        headers: {
          cookie: `session_token=${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: '20/09/2026',
          time: '14:00',
          lieu: 'Terrain test',
          categories: ['U11'],
          encadrants: [{ nom: 'Encadrant brouillon', numero: '' }],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const payload = await response.json();
      createdId = payload.plateau?.id ?? null;
      expect(payload.plateau).toMatchObject({
        planningStatus: 'draft',
        encadrants: [expect.objectContaining({ nom: 'Encadrant brouillon' })],
      });
    } finally {
      if (createdId) {
        const db = await getDb();
        await db.getRepository('Plateau').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await cleanup();
    }
  });
});

describe.skipIf(!dbAvailable)('POST/PUT /api/plateaux — validation du payload (issue #282)', () => {
  it('renvoie 400 avec un détail par champ pour un corps structurellement malformé', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await POST(jsonRequest('http://localhost/api/plateaux', 'POST', {
        date: '20/09/2026',
        time: '14:00',
        lieu: 'Terrain test',
        categories: ['U11', 42], // entrée non textuelle
        encadrants: 'pas une liste',
      }, token));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Requête invalide');
      const fields = (body.details as Array<{ field: string }>).map((issue) => issue.field).sort();
      expect(fields).toEqual(['categories[1]', 'encadrants']);
    } finally {
      await cleanup();
    }
  });

  it('n’écrit jamais en base quand le payload est rejeté', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const db = await getDb();
      const before = await db.getRepository('Plateau').count();

      const response = await POST(jsonRequest('http://localhost/api/plateaux', 'POST', {
        date: '20/09/2026',
        time: '14:00',
        // lieu manquant
      }, token));
      expect(response.status).toBe(400);

      const after = await db.getRepository('Plateau').count();
      expect(after).toBe(before);
    } finally {
      await cleanup();
    }
  });

  it('PUT accepte une mise à jour partielle mais rejette un champ fourni et invalide', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let createdId: string | null = null;
    try {
      const createResponse = await POST(jsonRequest('http://localhost/api/plateaux', 'POST', {
        date: '20/09/2026',
        time: '14:00',
        lieu: 'Terrain test',
      }, token));
      expect(createResponse.status).toBe(200);
      createdId = (await createResponse.json()).plateau.id as string;

      const partialUpdate = await PUT(jsonRequest('http://localhost/api/plateaux', 'PUT', {
        id: createdId,
        lieu: 'Nouveau terrain',
      }, token));
      expect(partialUpdate.status).toBe(200);

      const invalidUpdate = await PUT(jsonRequest('http://localhost/api/plateaux', 'PUT', {
        id: createdId,
        date: '31/02/2026',
      }, token));
      expect(invalidUpdate.status).toBe(400);
      const body = await invalidUpdate.json();
      expect(body.details).toEqual([{ field: 'date', message: 'doit être une date valide au format jj/mm/aaaa' }]);
    } finally {
      if (createdId) {
        const db = await getDb();
        await db.getRepository('Plateau').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await cleanup();
    }
  });
});
