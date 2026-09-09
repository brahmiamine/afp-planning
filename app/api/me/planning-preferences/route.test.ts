import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { GET, PUT } from './route';

const dbAvailable = await isDbAvailable();
const runId = `planning-prefs-${Date.now()}`;
const clubId = `${runId}-club`;

function getRequest(token: string, planningFunction?: string) {
  const url = planningFunction
    ? `http://localhost/api/me/planning-preferences?function=${planningFunction}`
    : 'http://localhost/api/me/planning-preferences';
  return new NextRequest(url, { headers: { cookie: `session_token=${token}` } });
}

function putRequest(token: string, body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/me/planning-preferences', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
  });
}

describe.skipIf(!dbAvailable)('/api/me/planning-preferences (issue #202)', () => {
  afterEach(async () => {
    const db = await getDb();
    await db.query('DELETE FROM planning_records WHERE club_id = ? AND kind = ?', [clubId, 'person-preference']);
  });

  it('rejette une fonction non tenue par le compte', async () => {
    const { token, cleanup } = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    try {
      const response = await GET(getRequest(token, 'arbitre_club'));
      expect(response.status).toBe(403);
    } finally {
      await cleanup();
    }
  });

  it('déduit la fonction par défaut quand une seule est tenue', async () => {
    const { token, cleanup } = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    try {
      const response = await GET(getRequest(token));
      expect(response.status).toBe(200);
      expect((await response.json()).function).toBe('encadrant');
    } finally {
      await cleanup();
    }
  });

  it('exige une fonction explicite quand plusieurs sont tenues', async () => {
    const { token, cleanup } = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club', 'encadrant']);
    try {
      const response = await GET(getRequest(token));
      expect(response.status).toBe(403);
    } finally {
      await cleanup();
    }
  });

  it('enregistre des préférences distinctes pour un dirigeant cumulant Arbitre club et Encadrant', async () => {
    const { token, cleanup } = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club', 'encadrant']);
    try {
      const putArbitre = await PUT(putRequest(token, {
        function: 'arbitre_club',
        preferredCategories: ['U15'],
        preferredWeekdays: [],
        preferredTimeRanges: [],
        preferredLocations: [],
        maxAssignmentsPerWeek: 2,
        maxTravelMinutes: null,
      }));
      expect(putArbitre.status).toBe(200);

      const putEncadrant = await PUT(putRequest(token, {
        function: 'encadrant',
        preferredCategories: ['U9'],
        preferredWeekdays: [],
        preferredTimeRanges: [],
        preferredLocations: [],
        maxAssignmentsPerWeek: 5,
        maxTravelMinutes: null,
      }));
      expect(putEncadrant.status).toBe(200);

      const gotArbitre = await (await GET(getRequest(token, 'arbitre_club'))).json();
      const gotEncadrant = await (await GET(getRequest(token, 'encadrant'))).json();
      expect(gotArbitre.preferences.maxAssignmentsPerWeek).toBe(2);
      expect(gotArbitre.preferences.preferredCategories).toEqual(['U15']);
      expect(gotEncadrant.preferences.maxAssignmentsPerWeek).toBe(5);
      expect(gotEncadrant.preferences.preferredCategories).toEqual(['U9']);
    } finally {
      await cleanup();
    }
  });

  it('conserve l’historique d’une fonction retirée sans la rendre à nouveau accessible', async () => {
    const { user, token, cleanup } = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club', 'encadrant']);
    try {
      const saved = await PUT(putRequest(token, {
        function: 'arbitre_club',
        preferredCategories: ['U15'],
        preferredWeekdays: [],
        preferredTimeRanges: [],
        preferredLocations: [],
        maxAssignmentsPerWeek: 2,
        maxTravelMinutes: null,
      }));
      expect(saved.status).toBe(200);

      // Le dirigeant ne tient plus la fonction Arbitre club : la préférence enregistrée
      // n'est plus accessible via l'API...
      const db = await getDb();
      await db.getRepository('User').update({ id: user.id }, { planningFunctions: ['encadrant'] });
      const afterRemoval = await GET(getRequest(token, 'arbitre_club'));
      expect(afterRemoval.status).toBe(403);

      // ...mais l'enregistrement lui-même n'a pas été supprimé.
      const rows = await db.query(
        'SELECT payload FROM planning_records WHERE club_id = ? AND kind = ? AND person_id = ? AND person_type = ?',
        [clubId, 'person-preference', user.id, 'officiel'],
      );
      expect(rows).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});
