import { expect, test } from '@playwright/test';

test('starter recipes can be searched, inspected and closed with focus restored', async ({
  page,
}) => {
  await page.goto('/');
  const cards = page.getByRole('button', { name: /^View / });
  await expect(cards).toHaveCount(12);
  await page.getByRole('textbox', { name: 'Search recipes' }).fill('sesame');
  const recipe = page.getByRole('button', { name: 'View Sesame noodle bowl' });
  await expect(cards).toHaveCount(1);
  await recipe.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('200 g wheat noodles, dried');
  await expect(page.getByRole('dialog')).toContainText('chili oil (optional, to taste)');
  await expect(page.getByRole('link', { name: 'Sign in to save recipes' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(recipe).toBeFocused();
  await page.getByRole('textbox', { name: 'Search recipes' }).fill('nothing matches');
  await expect(page.getByRole('heading', { name: 'No starter recipes found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(cards).toHaveCount(12);
});

test('navigation honestly describes unavailable meal features and fits the viewport', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
  await expect(page.getByRole('heading', { name: 'Shopping', exact: true })).toBeVisible();
  await expect(
    page.getByText('Shopping lists are not available yet. Recipes and meal orders are.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Browse the menu' }).click();
  await expect(page.getByRole('heading', { name: 'Starter recipes' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('API errors stay JSON instead of returning the application shell', async ({ request }) => {
  const response = await request.get('/api/missing', { headers: { Accept: 'text/html' } });
  expect(response.status()).toBe(404);
  expect(response.headers()['content-type']).toContain('application/json');
});
