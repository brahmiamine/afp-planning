import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
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
});
