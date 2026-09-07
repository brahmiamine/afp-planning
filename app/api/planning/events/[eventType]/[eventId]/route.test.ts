import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import type { MatchExtraEntity, MatchOfficialEntity } from '@/lib/db/schemas';
import { POST as createEntrainement } from '@/app/api/entrainements/route';
import { PUT } from './route';

const dbAvailable = await isDbAvailable();

vi.mock('@/lib/planning/event-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/planning/event-store')>();
  return { ...actual, savePlanningPublication: vi.fn(actual.savePlanningPublication) };
});
vi.mock('@/lib/db/audit-log', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/audit-log')>();
  return { ...actual, logAuditEntry: vi.fn(actual.logAuditEntry) };
});

const { savePlanningPublication } = await import('@/lib/planning/event-store');
const { logAuditEntry } = await import('@/lib/db/audit-log');

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

describe.skipIf(!dbAvailable)('PUT /api/planning/events/[eventType]/[eventId] — atomicité (issue #152)', () => {
  it('does not leave the source data modified when the publication-status write fails', async () => {
    const { user, token, cleanup } = await createTestUserAndSession('admin');
    const eventId = `test-officiel-${randomBytes(4).toString('hex')}`;
    try {
      const db = await getDb();
      await db.getRepository<MatchOfficialEntity>('MatchOfficial').save({
        id: eventId,
        clubId: user.clubId,
        date: '20/09/2026',
        time: '15:00',
        payload: {
          id: eventId,
          type: 'officiel',
          date: '20/09/2026',
          time: '15:00',
          localTeam: 'Equipe A',
          awayTeam: 'Equipe B',
          durationMinutes: 90,
        },
      });
      await db.getRepository<MatchExtraEntity>('MatchExtra').save({
        matchId: eventId,
        clubId: user.clubId,
        payload: { id: eventId, planningStatus: 'published' },
      });

      vi.mocked(savePlanningPublication).mockRejectedValueOnce(new Error('injected failure'));

      const response = await PUT(
        putRequest('officiel', eventId, { localTeam: 'Equipe A modifiée', expectedRevision: 0 }, token),
        { params: { eventType: 'officiel', eventId } },
      );
      expect(response.status).toBe(500);

      // La panne est survenue après la mise à jour de la donnée source mais avant celle du
      // statut de publication : les deux écritures partagent une transaction, donc la donnée
      // source doit être revenue à son état d'origine plutôt que de rester modifiée pendant
      // que le statut est toujours « published » (issue #152).
      const matchRow = await db.getRepository('MatchOfficial').findOneBy({ id: eventId });
      expect((matchRow?.payload as { localTeam?: string })?.localTeam).toBe('Equipe A');

      const extraRow = await db.getRepository('MatchExtra').findOneBy({ matchId: eventId });
      expect((extraRow?.payload as { planningStatus?: string })?.planningStatus).toBe('published');
    } finally {
      const db = await getDb();
      await db.getRepository('MatchOfficial').delete({ id: eventId });
      await db.getRepository('MatchExtra').delete({ matchId: eventId });
      await db.getRepository('MatchAuditLog').delete({ entityId: eventId });
      await cleanup();
    }
  });

  it('does not persist the source data change when writing the audit entry fails', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let createdId: string | null = null;
    try {
      const db = await getDb();
      const createResponse = await createEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '20/09/2026', time: '10:00', lieu: 'Terrain initial', categorie: 'U13', encadrants: [] }),
      }));
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      createdId = created.entrainement.id as string;

      vi.mocked(logAuditEntry).mockRejectedValueOnce(new Error('injected failure'));

      const response = await PUT(
        putRequest('entrainement', createdId, { lieu: 'Terrain modifié', expectedRevision: 0 }, token),
        { params: { eventType: 'entrainement', eventId: createdId } },
      );
      expect(response.status).toBe(500);

      // L'entrée d'audit fait partie de la même transaction que l'écriture métier : si elle
      // échoue, la modification ne doit pas être visible non plus (issue #152).
      const row = await db.getRepository('Entrainement').findOneBy({ id: createdId });
      expect((row?.payload as { lieu?: string })?.lieu).toBe('Terrain initial');
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
