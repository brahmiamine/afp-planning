import { expect, test } from './fixtures';

/**
 * Issue #341 : la préparation / contrôle planning ne doit pas imposer de scroll horizontal
 * systématique sur mobile (viewport 390px).
 */
test('planning controle has no horizontal overflow at 320px (issue #387)', async ({ adminPage }) => {
  await adminPage.setViewportSize({ width: 320, height: 844 });
  await adminPage.goto('/club/planning/controle');
  await adminPage.waitForLoadState('networkidle');

  const overflow = await adminPage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
});

test('planning controle has no horizontal overflow at 390px (issue #341)', async ({ adminPage }) => {
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.goto('/club/planning/controle');
  await adminPage.waitForLoadState('networkidle');

  await expect(adminPage.getByRole('heading', { name: /Construire et modifier le planning/i })).toBeVisible();

  const overflow = await adminPage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

  await expect(adminPage.getByRole('button', { name: /Publier/i })).toBeVisible();
});

test('planning preparation has no horizontal overflow at 390px (issue #341)', async ({ adminPage }) => {
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.goto('/club/planning');
  await adminPage.waitForLoadState('networkidle');

  const overflow = await adminPage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
});
