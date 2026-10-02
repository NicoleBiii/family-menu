import { expect, test, type Page } from '@playwright/test';

// UX-001: error and session states the user can recover from.

function unique(label: string) {
  return `${label} ${test.info().project.name} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

async function signInWithHousehold(page: Page) {
  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page.getByRole('textbox', { name: 'Test account name' }).fill(unique('States'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Household name' }).fill(unique('Home'));
  await page.getByRole('button', { name: 'Create household' }).click();
  await expect(page.getByRole('button', { name: 'Create invitation link' })).toBeVisible();
}

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name });

test('an ended session returns the user to sign-in with an explanation', async ({ page }) => {
  await signInWithHousehold(page);
  // End the session elsewhere (e.g. signed out on another device or expired).
  const session = await (await page.request.get('/api/auth/session')).json();
  const logout = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': session.csrfToken, Origin: 'http://127.0.0.1:4173' },
  });
  expect(logout.status()).toBe(204);

  await nav(page, 'Orders').click();
  const banner = page
    .getByRole('alert')
    .filter({ has: page.getByRole('button', { name: 'Dismiss' }) });
  await expect(banner).toContainText('Your session has ended. Please sign in again.');
  await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(1); // the page's own error is gone
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('offline and server failures show plain messages and recover', async ({ page, context }) => {
  await signInWithHousehold(page);
  await nav(page, 'Shopping').click();
  await expect(page.getByRole('heading', { name: 'Nothing to buy yet' })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Refresh shopping list' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Family Menu could not be reached. Check your connection and try again.',
  );
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Refresh shopping list' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.route('**/api/households/*/orders*', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 500, message: 'Internal server error' }),
    }),
  );
  await nav(page, 'Orders').click();
  await expect(page.getByRole('alert')).toHaveText(
    'Something went wrong on our side. Please try again in a moment.',
  );
});

test('each page has its own document title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Family Menu — A little more together');
  for (const name of ['Orders', 'Shopping', 'Household']) {
    await nav(page, name).click();
    await expect(page).toHaveTitle(`${name} · Family Menu`);
  }
  await nav(page, 'Menu').click();
  await expect(page).toHaveTitle('Family Menu — A little more together');
  await page.getByRole('button', { name: 'Manage recipes & menu' }).click();
  await expect(page).toHaveTitle('Recipes · Family Menu');
  await page.goto('/checkout');
  await expect(page).toHaveTitle('Confirm your order · Family Menu');
});
