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
const { POST } = await import('./route');
const dbAvailable = await isDbAvailable();

const cases = [
  {
    eventType: 'amical' as const,
    entity: 'MatchAmical' as const,
    body: {
      date: '20/09/2026', time: '10:00', competition: 'Amical',
      localTeam: 'AFP', awayTeam: 'Visiteurs', venue: 'domicile',
    },
  },
  {
    eventType: 'entrainement' as const,
    entity: 'Entrainement' as const,
    body: { date: '20/09/2026', time: '10:00', lieu: 'Terrain rollback' },
  },
  {
    eventType: 'plateau' as const,
    entity: 'Plateau' as const,
    body: { date: '20/09/2026', time: '10:00', lieu: 'Terrain rollback', categories: ['U9'] },
  },
];

function request(eventType: string, body: unknown, token: string) {
  return new NextRequest(`http://localhost/api/planning/events/${eventType}`, {
    method: 'POST',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('POST canonique — atomicité après écriture source (issue #275)', () => {
  for (const testCase of cases) {
    it(`rollback la création ${testCase.eventType} si l'audit échoue`, async () => {
      const { token, cleanup, user } = await createTestUserAndSession('admin');
      try {
        const db = await getDb();
        const beforeSource = await db.getRepository(testCase.entity).countBy({ clubId: user.clubId });
        const beforeExtras = testCase.eventType === 'amical'
          ? await db.getRepository('MatchExtra').countBy({ clubId: user.clubId })
          : null;

        vi.mocked(logAuditEntry).mockRejectedValueOnce(new Error('injected audit failure'));
        const response = await POST(request(testCase.eventType, testCase.body, token), {
          params: { eventType: testCase.eventType },
        });
        expect(response.status).toBe(500);

        expect(await db.getRepository(testCase.entity).countBy({ clubId: user.clubId })).toBe(beforeSource);
        if (beforeExtras !== null) {
          expect(await db.getRepository('MatchExtra').countBy({ clubId: user.clubId })).toBe(beforeExtras);
        }
      } finally {
        await cleanup();
      }
    });
  }
});
