import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';

vi.mock('@/lib/db/audit-log', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/audit-log')>();
  return { ...actual, logAuditEntry: vi.fn(actual.logAuditEntry) };
});

const { logAuditEntry } = await import('@/lib/db/audit-log');
const { PUT } = await import('./route');
const dbAvailable = await isDbAvailable();

type EventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';

function request(eventType: EventType, eventId: string, body: unknown, token: string) {
  return new NextRequest(`http://localhost/api/planning/events/${eventType}/${eventId}`, {
    method: 'PUT',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('PUT canonique — rollback tardif pour chaque type (issue #275)', () => {
  for (const eventType of ['officiel', 'amical', 'entrainement', 'plateau'] as const) {
    it(`rollback ${eventType} si l'audit échoue après les écritures métier`, async () => {
      const clubId = `test-275-${eventType}-${randomBytes(4).toString('hex')}`;
      const eventId = `${eventType}-${randomBytes(5).toString('hex')}`;
      const { token, cleanup } = await createTestUserAndSession('admin', { clubId });
      const db = await getDb();

      try {
        if (eventType === 'officiel' || eventType === 'amical') {
          const entity = eventType === 'officiel' ? 'MatchOfficial' : 'MatchAmical';
          await db.getRepository(entity).save({
            id: eventId,
            clubId,
            date: '20/09/2026',
            time: '15:00',
            payload: {
              id: eventId,
              type: eventType,
              date: '20/09/2026',
              time: '15:00',
              competition: eventType === 'officiel' ? 'Championnat' : 'Amical',
              localTeam: 'Equipe initiale',
              awayTeam: 'Visiteurs',
              venue: 'domicile',
              durationMinutes: 90,
            },
          });
          await db.getRepository('MatchExtra').save({
            matchId: eventId,
            clubId,
            payload: { id: eventId, planningStatus: 'draft', planningRevision: 0 },
          });
        } else if (eventType === 'entrainement') {
          await db.getRepository('Entrainement').save({
            id: eventId,
            clubId,
            date: '20/09/2026',
            time: '15:00',
            payload: {
              id: eventId,
              type: 'entrainement',
              date: '20/09/2026',
              time: '15:00',
              lieu: 'Terrain initial',
              durationMinutes: 90,
              planningStatus: 'draft',
              planningRevision: 0,
              encadrants: [],
            },
          });
        } else {
          await db.getRepository('Plateau').save({
            id: eventId,
            clubId,
            date: '20/09/2026',
            time: '15:00',
            payload: {
              id: eventId,
              type: 'plateau',
              date: '20/09/2026',
              time: '15:00',
              lieu: 'Terrain initial',
              categories: ['U9'],
              durationMinutes: 120,
              planningStatus: 'draft',
              planningRevision: 0,
              encadrants: [],
            },
          });
        }

        vi.mocked(logAuditEntry).mockRejectedValueOnce(new Error('injected late audit failure'));
        const body = eventType === 'officiel' || eventType === 'amical'
          ? { localTeam: 'Equipe modifiée', expectedRevision: 0 }
          : { lieu: 'Terrain modifié', expectedRevision: 0 };
        const response = await PUT(request(eventType, eventId, body, token), {
          params: { eventType, eventId },
        });
        expect(response.status).toBe(500);

        if (eventType === 'officiel' || eventType === 'amical') {
          const entity = eventType === 'officiel' ? 'MatchOfficial' : 'MatchAmical';
          const row = await db.getRepository(entity).findOneByOrFail({ id: eventId, clubId });
          expect((row.payload as { localTeam?: string }).localTeam).toBe('Equipe initiale');
          const extras = await db.getRepository('MatchExtra').findOneByOrFail({ matchId: eventId, clubId });
          expect((extras.payload as { planningRevision?: number }).planningRevision ?? 0).toBe(0);
        } else {
          const entity = eventType === 'entrainement' ? 'Entrainement' : 'Plateau';
          const row = await db.getRepository(entity).findOneByOrFail({ id: eventId, clubId });
          expect((row.payload as { lieu?: string }).lieu).toBe('Terrain initial');
          expect((row.payload as { planningRevision?: number }).planningRevision ?? 0).toBe(0);
        }
      } finally {
        await db.getRepository('MatchAuditLog').delete({ entityId: eventId, clubId });
        await db.getRepository('MatchExtra').delete({ matchId: eventId, clubId });
        await db.getRepository('MatchOfficial').delete({ id: eventId, clubId });
        await db.getRepository('MatchAmical').delete({ id: eventId, clubId });
        await db.getRepository('Entrainement').delete({ id: eventId, clubId });
        await db.getRepository('Plateau').delete({ id: eventId, clubId });
        await cleanup();
      }
    });
  }
});
