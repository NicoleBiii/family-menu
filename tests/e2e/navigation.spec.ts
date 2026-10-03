import { expect, test, type Page } from '@playwright/test';

// UX-004: Back — the page's own Back, the browser's or a phone's swipe — leaves one in-place
// view at a time (recipe editor, AI drafting, categories, recipe card, order editor), and a
// placed order's confirmation page is not revisited.

function unique(label: string) {
  return `${label} ${test.info().project.name} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

async function signInWithRecipe(page: Page) {
  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page.getByRole('textbox', { name: 'Test account name' }).fill(unique('Back'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Household name' }).fill(unique('Back home'));
  await page.getByRole('button', { name: 'Create household' }).click();
  await expect(page.getByRole('button', { name: 'Create invitation link' })).toBeVisible();
  const session = await (await page.request.get('/api/auth/session')).json();
  const created = await page.request.post(`/api/households/${session.households[0].id}/recipes`, {
    headers: { 'X-CSRF-Token': session.csrfToken, Origin: 'http://127.0.0.1:4173' },
    data: {
      requestId: crypto.randomUUID(),
      name: 'Back soup',
      servings: 2,
      steps: [],
      ingredients: [{ name: 'Water', quantity: '1', unit: 'cup' }],
    },
  });
  expect(created.status()).toBe(201);
  await page.getByRole('link', { name: 'Family Menu home' }).click();
  await page.getByRole('button', { name: 'Manage recipes & menu' }).click();
  await expect(page).toHaveURL(/\/recipes$/);
}

const recipesList = (page: Page) => page.getByRole('heading', { name: 'Your household menu' });

test('Back leaves recipe views one at a time and then returns to Home', async ({ page }) => {
  await signInWithRecipe(page);

  // The page's own Back closes the new-recipe form.
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(recipesList(page)).toBeVisible();
  await expect(page).toHaveURL(/\/recipes$/);

  // The browser's Back closes AI drafting, categories and the recipe card the same way.
  await page.getByRole('button', { name: /Draft with AI/ }).click();
  await expect(page.getByRole('heading', { name: 'Draft a recipe with AI' })).toBeVisible();
  await page.goBack();
  await expect(recipesList(page)).toBeVisible();
  await page.getByRole('button', { name: 'Categories' }).click();
  await expect(page.getByRole('textbox', { name: 'New category name' })).toBeVisible();
  await page.goBack();
  await expect(recipesList(page)).toBeVisible();
  await page.getByRole('button', { name: 'View Back soup' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page).toHaveURL(/\/recipes$/);

  // A view closed by its own button leaves no extra Back step behind.
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(recipesList(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Your household menu' })).toBeVisible();
});

test('Back from a reviewed AI draft returns to AI drafting first', async ({ page }) => {
  await signInWithRecipe(page);
  await page.getByRole('button', { name: /Draft with AI/ }).click();
  await page.getByRole('textbox', { name: 'Dish name' }).fill('Back noodles');
  await page.getByRole('button', { name: 'Write a draft' }).click();
  await expect(page.getByRole('heading', { name: 'Review the AI draft' })).toBeVisible({
    timeout: 15_000,
  });
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Draft a recipe with AI' })).toBeVisible();
  await page.goBack();
  await expect(recipesList(page)).toBeVisible();
  await expect(page).toHaveURL(/\/recipes$/);
});

test('Back leaves the order editor, and skips a placed order’s confirmation page', async ({
  page,
}) => {
  await signInWithRecipe(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Menu' })
    .click();
  await page.getByRole('button', { name: 'Add Back soup to the basket' }).click();
  await page.getByRole('button', { name: 'Review basket' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page).toHaveURL(/\/meals$/);

  await page.getByRole('article').first().getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/meals$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/, { timeout: 5_000 });
  await expect(page.getByRole('button', { name: 'Add Back soup to the basket' })).toBeVisible();
});
