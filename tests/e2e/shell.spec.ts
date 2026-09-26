import { expect, test } from '@playwright/test';

test('sample recipes can be filtered, inspected and closed with focus restored', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search recipes' }).fill('sesame');
  const recipe = page.getByRole('button', { name: 'View Sesame noodle bowl' });
  await expect(page.getByRole('button', { name: /^View / })).toHaveCount(1);
  await recipe.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('200 g noodles');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(recipe).toBeFocused();
  await page.getByRole('textbox', { name: 'Search recipes' }).fill('nothing matches');
  await expect(page.getByRole('heading', { name: 'No recipes found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('button', { name: /^View / })).toHaveCount(4);
});

test('navigation honestly describes unavailable account features and fits the viewport', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
  await expect(page.getByRole('heading', { name: 'Shopping', exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'This is a sample preview. Accounts and saved meal plans are not available yet.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Browse sample recipes' }).click();
  await expect(page.getByRole('heading', { name: 'Your next favourite meal' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('API errors stay JSON instead of returning the application shell', async ({ request }) => {
  const response = await request.get('/api/missing', { headers: { Accept: 'text/html' } });
  expect(response.status()).toBe(404);
  expect(response.headers()['content-type']).toContain('application/json');
});
