import { expect, test } from '@playwright/test';

test('a member reviews external JSON, chooses a category and imports two recipes', async ({
  page,
}) => {
  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page.getByRole('textbox', { name: 'Test account name' }).fill(`Import ${Date.now()}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Household name' }).fill(`Bulk kitchen ${Date.now()}`);
  await page.getByRole('button', { name: 'Create household' }).click();
  await page.getByRole('link', { name: 'Family Menu home' }).click();
  await page.getByRole('button', { name: 'Manage recipes & menu' }).click();
  await page.getByRole('button', { name: 'Import menu' }).click();
  await expect(page).toHaveURL(/\/recipes\/import$/);
  await page.getByRole('textbox', { name: 'Paste JSON here' }).fill(
    JSON.stringify({
      version: 1,
      recipes: [
        {
          name: 'Cucumber salad',
          category: 'Cold dishes',
          servings: 2,
          ingredients: [{ name: 'Cucumber', quantity: '300', unit: 'g' }],
          steps: ['Slice and season.'],
        },
        {
          name: 'Tomato salad',
          category: 'Cold dishes',
          servings: 2,
          ingredients: [{ name: 'Tomato', quantity: '2', unit: 'piece' }],
          steps: ['Slice and season.'],
        },
      ],
    }),
  );
  await page.getByRole('button', { name: 'Check and preview' }).click();
  await expect(page.getByRole('heading', { name: 'Review dishes' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Import 2 dishes · new categories: 0' }),
  ).toBeDisabled();
  await page.getByRole('combobox', { name: 'Cold dishes' }).selectOption('create');
  await page.getByRole('button', { name: 'Import 2 dishes · new categories: 1' }).click();
  await expect(page.getByRole('heading', { name: 'Imported 2 dishes' })).toBeVisible();
  await page.getByRole('button', { name: 'Return to recipes' }).click();
  await expect(page.getByRole('button', { name: 'View Cucumber salad' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Tomato salad' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
