import { expect, test, type Page } from '@playwright/test';

// SHOP-001 browser flow. Setup data goes through the API with the signed-in session to keep the
// test focused on the shopping views.
test.use({ timezoneId: 'America/Toronto' });

function unique(label: string) {
  return `${label} ${test.info().project.name} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

async function signInWithHousehold(page: Page) {
  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page.getByRole('textbox', { name: 'Test account name' }).fill(unique('Shopper'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Household name' }).fill(unique('Home'));
  await page.getByRole('button', { name: 'Create household' }).click();
  await expect(page.getByRole('button', { name: 'Create invitation link' })).toBeVisible();
  const session = await (await page.request.get('/api/auth/session')).json();
  const householdId: string = session.households[0].id;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api/households/${householdId}${path}`, {
      headers: { 'X-CSRF-Token': session.csrfToken, Origin: 'http://127.0.0.1:4173' },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  return { householdId, post };
}

test('pending orders add up in the combined view and show per meal by day', async ({ page }) => {
  const { post } = await signInWithHousehold(page);
  const rice = await post('/recipes', {
    requestId: crypto.randomUUID(),
    name: 'Chicken rice',
    servings: 2,
    ingredients: [
      { name: 'Chicken breast', quantity: '200', unit: 'g', form: 'raw' },
      { name: 'Egg', quantity: '1' },
      { name: 'Salt', note: 'to taste' },
    ],
  });
  const salad = await post('/recipes', {
    requestId: crypto.randomUUID(),
    name: 'Chicken salad',
    servings: 1,
    ingredients: [{ name: 'chicken breast', quantity: '0.2', unit: 'kg', form: 'raw' }],
  });
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(
    new Date(Date.now() + 86_400_000),
  );
  const first = await post('/orders', {
    requestId: crypto.randomUUID(),
    when: { type: 'scheduled', date: tomorrow, time: '18:00' },
    items: [{ recipeId: rice.id, servings: 3 }],
  });
  await post('/orders', {
    requestId: crypto.randomUUID(),
    when: { type: 'scheduled', date: tomorrow, time: '19:30' },
    items: [{ recipeId: salad.id, servings: 1 }],
  });

  await page.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
  await expect(page).toHaveURL(/\/shopping$/);
  const list = page.getByRole('list', { name: 'Combined shopping list' });
  const chicken = list.getByRole('listitem').filter({ hasText: 'Chicken breast' });
  await expect(chicken).toContainText('500 g');
  await expect(chicken).toContainText('For Chicken rice, Chicken salad');
  await expect(list.getByRole('listitem').filter({ hasText: 'Egg' })).toContainText('1.5 whole');
  await expect(list.getByRole('listitem').filter({ hasText: 'Salt' })).toContainText('to taste');
  await expect(page.getByText('2 orders · updated')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.getByRole('button', { name: 'By day' }).click();
  await expect(page.getByRole('heading', { name: 'Tomorrow' })).toBeVisible();
  const dinner = page.getByRole('article', { name: 'Meal at 18:00' });
  await expect(dinner).toContainText('Chicken rice · 3 servings');
  await expect(dinner).toContainText('300 g Chicken breast, raw');
  await expect(page.getByRole('article', { name: 'Meal at 19:30' })).toContainText(
    '0.2 kg chicken breast, raw',
  );

  // Cancelling elsewhere changes the totals after a refresh.
  await post(`/orders/${first.id}/cancel`, { expectedRevision: 1 });
  await page.getByRole('button', { name: 'Combined' }).click();
  await page.getByRole('button', { name: 'Refresh shopping list' }).click();
  await expect(chicken).toContainText('200 g');
  await expect(list.getByRole('listitem').filter({ hasText: 'Egg' })).toHaveCount(0);

  await page.getByRole('radio', { name: 'Meals between two dates' }).check();
  await page.getByLabel('From').fill('2020-01-01');
  await page.getByLabel('To').fill('2020-01-02');
  await expect(page.getByRole('heading', { name: 'Nothing to buy yet' })).toBeVisible();
});
