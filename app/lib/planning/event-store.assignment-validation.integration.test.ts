import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { runWithClubId } from '@/lib/auth/club-context';
import { PlanningValidationError } from '@/lib/planning/validation';
import { getPlanningEventSnapshot, saveRoleAssignments } from '@/lib/planning/event-store';
import { POST as createEntrainement } from '@/app/api/entrainements/route';
import { NextRequest } from 'next/server';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('saveRoleAssignments — indisponibilités (issue #337)', () => {
  it('rejette une affectation vers une personne indisponible quand assignmentValidation est activé', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const encadrant = await createTestUserAndSession('dirigeant', {
      clubId,
      indisponibilites: [{ id: 'off', type: 'day-range', dateStart: '20/09/2026', dateEnd: '20/09/2026' }],
    }, ['encadrant']);
    let createdId: string | null = null;

    try {
      const createResponse = await createEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${admin.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '20/09/2026',
          time: '10:00',
          lieu: 'Terrain test',
          categorie: 'U13',
          encadrants: [],
        }),
      }));
      expect(createResponse.status).toBe(200);
      createdId = (await createResponse.json()).entrainement.id as string;

      const db = await getDb();
      await runWithClubId(clubId, async () => {
        const snapshot = await getPlanningEventSnapshot(db, 'entrainement', createdId!);
        if (!snapshot) throw new Error('snapshot introuvable');

        await expect(saveRoleAssignments(db, snapshot, 'encadrant', [{
          nom: encadrant.user.nom,
          numero: '',
          personId: encadrant.user.id,
          personType: 'encadrant',
          status: 'pending',
        }])).rejects.toBeInstanceOf(PlanningValidationError);
      });
    } finally {
      if (createdId) {
        const db = await getDb();
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await admin.cleanup();
      await encadrant.cleanup();
    }
  });
});
