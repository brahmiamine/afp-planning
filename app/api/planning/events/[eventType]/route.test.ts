import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { POST } from './route';

const dbAvailable = await isDbAvailable();

type Case = {
  eventType: 'amical' | 'entrainement' | 'plateau';
  body: Record<string, unknown>;
  entity: 'MatchAmical' | 'Entrainement' | 'Plateau';
  responseKey: 'match' | 'entrainement' | 'plateau';
};

const cases: Case[] = [
  {
    eventType: 'amical',
    entity: 'MatchAmical',
    responseKey: 'match',
    body: {
      date: '20/09/2026',
      time: '10:00',
      competition: 'Amical',
      localTeam: 'AFP',
      awayTeam: 'Visiteurs',
      venue: 'domicile',
    },
  },
  {
    eventType: 'entrainement',
    entity: 'Entrainement',
    responseKey: 'entrainement',
    body: {
      date: '20/09/2026',
      time: '10:00',
      lieu: 'Terrain test',
    },
  },
  {
    eventType: 'plateau',
    entity: 'Plateau',
    responseKey: 'plateau',
    body: {
      date: '20/09/2026',
      time: '10:00',
      lieu: 'Terrain test',
      categories: ['U9'],
    },
  },
];

function requestFor(eventType: string, body: unknown, token: string) {
  return new NextRequest(`http://localhost/api/planning/events/${eventType}`, {
    method: 'POST',
    headers: {
      cookie: `session_token=${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('POST /api/planning/events/[eventType] — création canonique (issue #275)', () => {
  for (const testCase of cases) {
    it(`crée un ${testCase.eventType} et son audit dans le contrat canonique`, async () => {
      const { token, cleanup, user } = await createTestUserAndSession('admin');
      let id: string | null = null;
      try {
        const response = await POST(requestFor(testCase.eventType, testCase.body, token), {
          params: { eventType: testCase.eventType },
        });
        expect(response.status).toBe(200);
        const payload = await response.json();
        id = payload[testCase.responseKey]?.id ?? null;
        expect(id).toBeTruthy();

        const db = await getDb();
        const stored = await db.getRepository(testCase.entity).findOneBy({ id, clubId: user.clubId });
        expect(stored).toBeTruthy();
        const audit = await db.getRepository('MatchAuditLog').findOneBy({
          entityId: id,
          clubId: user.clubId,
          action: 'create',
        });
        expect(audit).toBeTruthy();

        if (testCase.eventType === 'amical') {
          const extras = await db.getRepository('MatchExtra').findOneBy({ matchId: id, clubId: user.clubId });
          expect(extras).toBeTruthy();
        }
      } finally {
        if (id) {
          const db = await getDb();
          if (testCase.eventType === 'amical') {
            await db.getRepository('MatchExtra').delete({ matchId: id, clubId: user.clubId });
          }
          await db.getRepository(testCase.entity).delete({ id, clubId: user.clubId });
          await db.getRepository('MatchAuditLog').delete({ entityId: id, clubId: user.clubId });
        }
        await cleanup();
      }
    });
  }

  it('refuse la création d’un match officiel, qui reste piloté par le scraper', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await POST(requestFor('officiel', {
        date: '20/09/2026',
        time: '10:00',
      }, token), { params: { eventType: 'officiel' } });
      expect(response.status).toBe(405);
    } finally {
      await cleanup();
    }
  });
});
