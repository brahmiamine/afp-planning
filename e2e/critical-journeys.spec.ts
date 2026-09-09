import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  E2E_ADMIN_EMAIL,
  E2E_CLUB_A,
  E2E_LEADER_EMAIL,
  E2E_OTHER_CLUB_EMAIL,
  E2E_PASSWORD,
} from './global-setup';

async function loginApi(request: APIRequestContext, email: string) {
  const response = await request.post('/api/auth/login', { data: { email, password: E2E_PASSWORD } });
  expect(response.ok()).toBeTruthy();
}

async function loginUi(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(E2E_PASSWORD);
  const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: 'Se connecter' }).click();
  expect((await loginResponse).ok()).toBeTruthy();
}

function futureDate(offsetDays: number) {
  const value = new Date(Date.now() + offsetDays * 86_400_000);
  return `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}`;
}

// Serial execution deliberately models one planning lifecycle while each browser context keeps its own session.\ntest.describe.serial('critical club journeys (issue #207)', () => {
  test('access roles route users correctly and a field function grants no admin permission', async ({ browser }) => {
    const adminPage = await browser.newPage();
    await loginUi(adminPage, E2E_ADMIN_EMAIL);
    await expect(adminPage).toHaveURL(/\/club$/, { timeout: 15_000 });

    const leaderPage = await browser.newPage();
    await loginUi(leaderPage, E2E_LEADER_EMAIL);
    await expect(leaderPage).toHaveURL(/\/mon-planning$/, { timeout: 15_000 });
    await leaderPage.goto('/club');
    await expect(leaderPage).toHaveURL(/\/mon-planning$/);
  });

  test('admin creates several events, leader sees only the globally published planning and can answer', async ({ playwright }) => {
    const admin = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const leader = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3100' });
    await loginApi(admin, E2E_ADMIN_EMAIL);
    await loginApi(leader, E2E_LEADER_EMAIL);
    for (const [index, time] of ['18:00', '20:00'].entries()) {
      const created = await admin.post('/api/entrainements', { data: {
        date: futureDate(30 + index), time, lieu: 'Terrain E2E', categorie: 'U15',
        encadrants: [{ nom: 'Dirigeant E2E Multi' }],
      } });
      expect(created.ok()).toBeTruthy();
    }
    const before = await leader.get('/api/me/planning');
    expect((await before.json()).assignments).toHaveLength(0);
    const publish = await admin.post('/api/planning/publication-all');
    expect(publish.ok()).toBeTruthy();
    const after = await leader.get('/api/me/planning');
    const assignments = (await after.json()).assignments;
    expect(assignments.length).toBeGreaterThanOrEqual(2);
    expect(assignments.every((item: { roles: string[] }) => item.roles.includes('encadrant'))).toBeTruthy();
    const accepted = await leader.post('/api/me/assignments/respond', { data: {
      eventId: assignments[0].eventId, eventType: assignments[0].eventType, role: 'encadrant', status: 'accepted',
    } });
    expect(accepted.ok()).toBeTruthy();
    const declined = await leader.post('/api/me/assignments/respond', { data: {
      eventId: assignments[1].eventId, eventType: assignments[1].eventType, role: 'encadrant', status: 'declined', declineReason: 'personal',
    } });
    expect(declined.ok()).toBeTruthy();
  });

  test('Mon planning displays the actual assigned function', async ({ page }) => {
    await loginUi(page, E2E_LEADER_EMAIL);
    await expect(page.getByText('Ma fonction : Encadrant').first()).toBeVisible();
  });

  test('invitation targets an existing unclaimed leader profile and preserves its functions', async ({ playwright }) => {
    const admin = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3100' });
    await loginApi(admin, E2E_ADMIN_EMAIL);
    const profiles = await admin.get('/api/encadrants');
    const profile = (await profiles.json()).encadrants.find((item: { nom: string }) => item.nom === 'Profil E2E à inviter');
    expect(profile).toBeTruthy();
    const invitation = await admin.post('/api/invitations', { data: {
      email: 'future-e2e@example.com', accessRole: 'dirigeant', personId: profile.id, planningFunctions: [], expiresInDays: 1,
    } });
    expect(invitation.ok()).toBeTruthy();
    expect((await invitation.json()).invitation.planningFunctions).toEqual(['encadrant']);
  });

  test('recurring events use the publication cycle and club B cannot observe club A data', async ({ playwright }) => {
    const adminA = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const adminB = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const leader = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3100' });
    await loginApi(adminA, E2E_ADMIN_EMAIL);
    await loginApi(adminB, E2E_OTHER_CLUB_EMAIL);
    await loginApi(leader, E2E_LEADER_EMAIL);
    const start = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 74 * 86_400_000).toISOString().slice(0, 10);
    const series = await adminA.post('/api/recurring-events', { data: {
      eventType: 'entrainement', startDate: start, endDate: end, frequencyWeeks: 1,
      time: '18:30', lieu: 'Terrain série E2E', encadrants: [{ nom: 'Dirigeant E2E Multi' }],
    } });
    expect(series.ok()).toBeTruthy();
    expect((await series.json()).count).toBe(3);
    // Le scénario précédent a volontairement refusé une affectation. Avant une nouvelle
    // publication globale, le dirigeant la ré-accepte afin que le second cycle teste la
    // série elle-même, sans dépendre d'un blocage métier laissé par un autre scénario.
    const currentAssignments = (await (await leader.get('/api/me/planning')).json()).assignments;
    for (const assignment of currentAssignments) {
      if (assignment.status === 'accepted') continue;
      const response = await leader.post('/api/me/assignments/respond', { data: {
        eventId: assignment.eventId, eventType: assignment.eventType, role: assignment.role, status: 'accepted',
      } });
      expect(response.ok()).toBeTruthy();
    }
    const publication = await adminA.post('/api/planning/publication-all');
    expect(publication.ok(), await publication.text()).toBeTruthy();
    const clubBEvents = await adminB.get('/api/entrainements');
    const serialized = JSON.stringify(await clubBEvents.json());
    expect(serialized).not.toContain('Terrain E2E');
    expect(serialized).not.toContain('Terrain série E2E');
    expect(E2E_CLUB_A).not.toBe('e2e-club-b');
  });
});
