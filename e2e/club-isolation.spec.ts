import { randomBytes } from 'node:crypto';
import { createAccount, freshClubId, authedContext, expect, test } from './fixtures';
import { getDb } from '@/lib/db';

/**
 * Parcours E2E n°8 de l'issue #207 : un utilisateur du club B ne doit jamais observer les
 * données du club A, y compris une fois le planning publié.
 */
test('un club B ne voit jamais les événements publiés du club A (issue #207)', async ({ browser, club: clubA, adminPage: adminA }) => {
  const clubBId = freshClubId();
  const lieu = `Terrain confidentiel ${randomBytes(4).toString('hex')}`;
  const adminB = await createAccount('admin', clubBId);
  const contextB = await authedContext(browser, adminB);
  const pageB = await contextB.newPage();
  const encadrantA = await createAccount('dirigeant', clubA.clubId, ['encadrant']);

  try {
    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const date = `${String(futureDate.getDate()).padStart(2, '0')}/${String(futureDate.getMonth() + 1).padStart(2, '0')}/${futureDate.getFullYear()}`;

    const createResponse = await adminA.request.post('/api/entrainements', {
      data: {
        date, time: '18:00', lieu, categorie: 'U15',
        encadrants: [{ nom: encadrantA.user.nom, personId: encadrantA.user.id, personType: 'encadrant' }],
      },
    });
    expect(createResponse.ok()).toBe(true);
    const publishResponse = await adminA.request.post('/api/planning/publication-all');
    expect(publishResponse.ok()).toBe(true);

    // Le club B, sur le même serveur et à la même date, ne doit voir ni l'événement ni son
    // lieu, que ce soit côté préparation ou côté planning publié.
    await pageB.goto('/club');
    await expect(pageB.getByText(lieu)).toHaveCount(0);

    const listResponse = await pageB.request.get('/api/entrainements');
    const listBody = await listResponse.json();
    const allEvents = Object.values(listBody.entrainements ?? {}).flat() as Array<{ lieu?: string }>;
    expect(allEvents.some((event) => event.lieu === lieu)).toBe(false);
  } finally {
    await contextB.close();
    await adminB.cleanup();
    await encadrantA.cleanup();
    const db = await getDb();
    await db.query('DELETE FROM planning_records WHERE club_id = ?', [clubBId]);
  }
});
