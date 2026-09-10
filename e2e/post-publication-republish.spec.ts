import { randomBytes } from 'node:crypto';
import { authedContext, createAccount, expect, test } from './fixtures';

/**
 * Parcours E2E post-publication (issue #349) : une modification après publication
 * globale n'apparaît dans /mon-planning qu'après republication — le snapshot publié
 * reste figé jusqu'à la prochaine publication, comme pour la publication initiale
 * (issue #207 / publication-cycle.spec.ts).
 */
test('une modification post-publication n’apparaît qu’après republication (issue #349)', async ({ browser, club, adminPage }) => {
  const lieu = `Terrain E2E ${randomBytes(4).toString('hex')}`;
  const encadrant = await createAccount('dirigeant', club.clubId, ['encadrant']);
  const dirigeantContext = await authedContext(browser, encadrant);
  const dirigeantPage = await dirigeantContext.newPage();

  try {
    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const date = `${String(futureDate.getDate()).padStart(2, '0')}/${String(futureDate.getMonth() + 1).padStart(2, '0')}/${futureDate.getFullYear()}`;

    const createResponse = await adminPage.request.post('/api/entrainements', {
      data: {
        date,
        time: '18:00',
        lieu,
        categorie: 'U15',
        encadrants: [{ nom: encadrant.user.nom, personId: encadrant.user.id, personType: 'encadrant' }],
      },
    });
    expect(createResponse.ok()).toBe(true);
    const { entrainement } = await createResponse.json() as { entrainement: { id: string } };

    const publishResponse = await adminPage.request.post('/api/planning/publication-all');
    expect(publishResponse.ok()).toBe(true);

    await dirigeantPage.goto('/mon-planning');
    await expect(dirigeantPage.getByText(lieu)).toBeVisible();
    await expect(dirigeantPage.getByText('18:00')).toBeVisible();

    const updateResponse = await adminPage.request.put('/api/entrainements', {
      data: {
        id: entrainement.id,
        date,
        time: '19:00',
        lieu,
        categorie: 'U15',
        encadrants: [{ nom: encadrant.user.nom, personId: encadrant.user.id, personType: 'encadrant' }],
      },
    });
    expect(updateResponse.ok()).toBe(true);

    // Avant republication : le snapshot publié conserve l'ancien horaire.
    await dirigeantPage.reload();
    await expect(dirigeantPage.getByText('18:00')).toBeVisible();
    await expect(dirigeantPage.getByText('19:00')).toHaveCount(0);

    const republishResponse = await adminPage.request.post('/api/planning/publication-all');
    expect(republishResponse.ok()).toBe(true);

    await dirigeantPage.reload();
    await expect(dirigeantPage.getByText(lieu)).toBeVisible();
    await expect(dirigeantPage.getByText('19:00')).toBeVisible();
    await expect(dirigeantPage.getByText('18:00')).toHaveCount(0);
  } finally {
    await dirigeantContext.close();
    await encadrant.cleanup();
  }
});
