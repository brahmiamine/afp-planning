import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import type { UserEntity } from '@/lib/db/schemas';
import { GET } from './route';

const dbAvailable = await isDbAvailable();

function getRequest(token: string) {
  return new NextRequest('http://localhost/api/club/indisponibilites', {
    headers: { cookie: `session_token=${token}` },
  });
}

describe.skipIf(!dbAvailable)('GET /api/club/indisponibilites (issue #320)', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  it('isole les clubs et expose les fonctions multiples d’un dirigeant', async () => {
    const clubA = `test-club-${randomBytes(6).toString('hex')}`;
    const clubB = `test-club-${randomBytes(6).toString('hex')}`;
    const adminA = await createTestUserAndSession('admin', { clubId: clubA });
    const adminB = await createTestUserAndSession('admin', { clubId: clubB });
    const dirigeant = await createTestUserAndSession(
      'dirigeant',
      { clubId: clubA },
      ['arbitre_club'],
    );
    const alice = await createTestUserAndSession(
      'dirigeant',
      {
        clubId: clubA,
        nom: `Alice Multi ${randomBytes(3).toString('hex')}`,
        indisponibilites: [
          { id: 'range', type: 'day-range', dateStart: '01/10/2026', dateEnd: '03/10/2026' },
          { id: 'slot', type: 'time-slot', date: '10/10/2026', startTime: '09:00', endTime: '11:00' },
        ],
      },
      ['arbitre_club', 'encadrant'],
    );
    const bob = await createTestUserAndSession(
      'dirigeant',
      {
        clubId: clubB,
        nom: `Bob Autre ${randomBytes(3).toString('hex')}`,
        indisponibilites: [
          { id: 'other', type: 'day-range', dateStart: '01/10/2026', dateEnd: '01/10/2026' },
        ],
      },
      ['accompagnateur'],
    );
    cleanups.push(adminA.cleanup, adminB.cleanup, dirigeant.cleanup, alice.cleanup, bob.cleanup);

    const forbidden = await GET(getRequest(dirigeant.token));
    expect(forbidden.status).toBe(403);

    const responseA = await GET(getRequest(adminA.token));
    expect(responseA.status).toBe(200);
    const bodyA = await responseA.json() as { items: Array<{ userName: string; planningFunctionLabels: string[]; type: string }> };
    expect(bodyA.items.every((item) => item.userName === alice.user.nom)).toBe(true);
    expect(bodyA.items).toHaveLength(2);
    expect(bodyA.items.some((item) => item.type === 'day-range')).toBe(true);
    expect(bodyA.items.some((item) => item.type === 'time-slot')).toBe(true);
    expect(bodyA.items[0]?.planningFunctionLabels).toEqual(['Arbitre club', 'Encadrant']);
    expect(bodyA.items.some((item) => item.userName === bob.user.nom)).toBe(false);

    const responseB = await GET(getRequest(adminB.token));
    expect(responseB.status).toBe(200);
    const bodyB = await responseB.json() as { items: Array<{ userName: string }> };
    expect(bodyB.items).toHaveLength(1);
    expect(bodyB.items[0]?.userName).toBe(bob.user.nom);

    const db = await getDb();
    const aliceRow = await db.getRepository<UserEntity>('User').findOneBy({ id: alice.user.id });
    expect(aliceRow?.clubId).toBe(clubA);
  });
});
