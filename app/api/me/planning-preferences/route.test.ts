import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { GET, PUT } from './route';

const dbAvailable = await isDbAvailable();
const clubId = `preferences-functions-${Date.now()}`;

function request(token: string, method: 'GET' | 'PUT', planningFunction?: string, body?: unknown) {
  const query = method === 'GET' && planningFunction ? `?function=${planningFunction}` : '';
  return new NextRequest(`http://localhost/api/me/planning-preferences${query}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
  });
}

describe.skipIf(!dbAvailable)('/api/me/planning-preferences (issue #202)', () => {
  afterEach(async () => {
    const db = await getDb();
    await db.query('DELETE FROM planning_records WHERE club_id = ? AND kind = ?', [clubId, 'person-preference']);
  });

  it('stores independent preferences for two functions held by the same dirigeant', async () => {
    const { token, cleanup } = await createTestUserAndSession(
      'dirigeant',
      { clubId },
      ['arbitre_club', 'encadrant'],
    );
    try {
      const arbitre = await PUT(request(token, 'PUT', undefined, {
        planningFunction: 'arbitre_club',
        preferredCategories: ['U15'],
        maxAssignmentsPerWeek: 2,
      }));
      const encadrant = await PUT(request(token, 'PUT', undefined, {
        planningFunction: 'encadrant',
        preferredCategories: ['U13'],
        maxAssignmentsPerWeek: 4,
      }));
      expect(arbitre.status).toBe(200);
      expect(encadrant.status).toBe(200);

      const arbitreRead = await GET(request(token, 'GET', 'arbitre_club'));
      const encadrantRead = await GET(request(token, 'GET', 'encadrant'));
      expect((await arbitreRead.json()).preferences).toMatchObject({
        preferredCategories: ['U15'],
        maxAssignmentsPerWeek: 2,
      });
      expect((await encadrantRead.json()).preferences).toMatchObject({
        preferredCategories: ['U13'],
        maxAssignmentsPerWeek: 4,
      });
    } finally {
      await cleanup();
    }
  });

  it('rejects a function the dirigeant does not hold and requires an explicit function', async () => {
    const { token, cleanup } = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club']);
    try {
      expect((await GET(request(token, 'GET'))).status).toBe(400);
      expect((await GET(request(token, 'GET', 'encadrant'))).status).toBe(403);
    } finally {
      await cleanup();
    }
  });
});
