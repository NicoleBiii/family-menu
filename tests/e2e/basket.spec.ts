import { expect, test, type Page } from '@playwright/test';

// UX-002 phase 3 browser flows (proposal §2): Meals browses dishes by category and collects
// them in a basket kept in this browser session; one Place order creates exactly one order,
// and emptying the basket creates none.

function unique(label: string) {
  return `${label} ${test.info().project.name} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

async function setUp(page: Page) {
  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page.getByRole('textbox', { name: 'Test account name' }).fill(unique('Basket cook'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Household name' }).fill(unique('Basket home'));
  await page.getByRole('button', { name: 'Create household' }).click();
  await expect(page.getByRole('button', { name: 'Create invitation link' })).toBeVisible();
  const session = await (await page.request.get('/api/auth/session')).json();
  const householdId: string = session.households[0].id;
  const post = (path: string, data: unknown) =>
    page.request.post(`/api/households/${householdId}${path}`, {
      headers: { 'X-CSRF-Token': session.csrfToken, Origin: 'http://127.0.0.1:4173' },
      data,
    });
  const soups = await (await post('/categories', { name: 'Soups' })).json();
  for (const [name, servings, pricePoints, categoryId] of [
    ['Miso soup', 2, 3, soups.id],
    ['Lentil soup', 4, 2, soups.id],
    ['Garlic bread', 1, 1, null],
  ] as const) {
    const created = await post('/recipes', {
      requestId: crypto.randomUUID(),
      name,
      servings,
      pricePoints,
      categoryId,
      steps: [],
      ingredients: [{ name: 'Water', quantity: '1', unit: 'cup' }],
    });
    expect(created.status()).toBe(201);
  }
  const orderCount = async () =>
    (await (await page.request.get(`/api/households/${householdId}/orders`)).json()).length;
  await page.getByRole('navigation').getByRole('button', { name: 'Meals' }).click();
  return { orderCount };
}

test('dishes are collected by category and placed as one order', async ({ page }) => {
  const { orderCount } = await setUp(page);
  await expect(page.getByRole('button', { name: 'Order dishes', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Soups' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Uncategorised' })).toBeVisible();

  await page.getByRole('button', { name: 'Add Miso soup to the basket' }).click();
  await page.getByRole('button', { name: 'One serving more of Miso soup' }).click();
  await page.getByRole('button', { name: 'Add Garlic bread to the basket' }).click();
  await page.getByRole('button', { name: 'Add Lentil soup to the basket' }).click();
  await page.getByRole('button', { name: 'One serving less of Lentil soup' }).click();
  await expect(page.locator('.basket-bar')).toContainText('3 dishes · 7 servings · 16 pts');
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'One serving less of Lentil soup' }).click();
  }
  await expect(page.getByRole('button', { name: 'Add Lentil soup to the basket' })).toBeVisible();
  await expect(page.locator('.basket-bar')).toContainText('2 dishes · 4 servings · 10 pts');
  await expect(page.getByRole('button', { name: 'Order dishes (2)' })).toBeVisible();

  // Search and category filters only change what is shown, not the basket.
  await page.getByRole('textbox', { name: 'Search dishes' }).fill('lentil');
  await expect(page.getByRole('button', { name: /Miso soup/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search dishes' }).fill('');
  await page
    .getByRole('group', { name: 'Filter by category' })
    .getByRole('button', { name: 'Uncategorised' })
    .click();
  await expect(page.getByRole('heading', { name: 'Soups' })).toBeHidden();
  await expect(page.locator('.basket-bar')).toContainText('2 dishes');

  // The basket survives going to another page, switching language and reloading.
  await page.getByRole('navigation').getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: '简体中文' }).click();
  await page.getByRole('navigation').getByRole('button', { name: '点单' }).click();
  await expect(page.locator('.basket-bar')).toContainText('2 道菜 · 4 份 · 10 积分');
  await page.getByRole('button', { name: 'English' }).click();
  await page.reload();
  await expect(page.locator('.basket-bar')).toContainText('2 dishes · 4 servings · 10 pts');
  expect(await orderCount()).toBe(0);

  await page.getByRole('button', { name: 'Review basket' }).click();
  await expect(page.getByRole('heading', { name: 'New meal order' })).toBeFocused();
  await expect(page.getByRole('spinbutton', { name: 'Servings for Miso soup' })).toHaveValue('3');
  await page.getByRole('spinbutton', { name: 'Servings for Garlic bread' }).fill('2');
  await page.getByRole('textbox', { name: 'Notes (optional)' }).fill('Dinner for the cousins');
  // Going back for another dish keeps the review edits.
  await page.getByRole('button', { name: 'Add more dishes' }).click();
  await page.getByRole('button', { name: 'Add Lentil soup to the basket' }).click();
  await page.getByRole('button', { name: 'Review basket' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Servings for Garlic bread' })).toHaveValue(
    '2',
  );
  await expect(page.getByRole('textbox', { name: 'Notes (optional)' })).toHaveValue(
    'Dinner for the cousins',
  );
  await page.getByRole('button', { name: 'Remove Lentil soup' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Place order' }).click();

  await expect(page.getByText(/Saved: Miso soup, Garlic bread/)).toBeVisible();
  const card = page.getByRole('article').first();
  await expect(card).toContainText('Miso soup');
  await expect(card).toContainText('Garlic bread');
  await expect(card).toContainText('11 pts');
  await expect(card).toContainText('Dinner for the cousins');
  expect(await orderCount()).toBe(1);

  // The placed basket is empty again; a reload does not resubmit it.
  await page.getByRole('button', { name: 'Order dishes', exact: true }).click();
  await expect(page.locator('.basket-bar')).toHaveCount(0);
  await page.reload();
  expect(await orderCount()).toBe(1);
});

test('emptying the basket places no order', async ({ page }) => {
  const { orderCount } = await setUp(page);
  await page.getByRole('button', { name: 'Add Miso soup to the basket' }).click();
  await page.getByRole('button', { name: 'Review basket' }).click();
  await page.getByRole('button', { name: 'Remove Miso soup' }).click();
  await expect(page.getByText('The basket is empty. Add dishes first.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place order' })).toBeDisabled();
  await page.getByRole('button', { name: 'Add more dishes' }).click();
  await page.getByRole('button', { name: 'Add Garlic bread to the basket' }).click();

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Empty basket' }).click();
  await expect(page.locator('.basket-bar')).toContainText('1 dish');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Empty basket' }).click();
  await expect(page.locator('.basket-bar')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add Garlic bread to the basket' })).toBeVisible();
  expect(await orderCount()).toBe(0);
});

test('a dish archived after it was added leaves the basket with an explanation', async ({
  page,
}) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Add Miso soup to the basket' }).click();
  await page.getByRole('button', { name: 'Add Garlic bread to the basket' }).click();
  const session = await (await page.request.get('/api/auth/session')).json();
  const householdId = session.households[0].id;
  const recipes = await (await page.request.get(`/api/households/${householdId}/recipes`)).json();
  const miso = recipes.find((recipe: { name: string }) => recipe.name === 'Miso soup');
  const archived = await page.request.post(
    `/api/households/${householdId}/recipes/${miso.id}/archive`,
    {
      headers: { 'X-CSRF-Token': session.csrfToken, Origin: 'http://127.0.0.1:4173' },
      data: { expectedRevision: miso.revision },
    },
  );
  expect(archived.status()).toBe(200);
  await page.reload();
  await expect(page.getByText('Some dishes are no longer on the menu')).toBeVisible();
  await expect(page.locator('.basket-bar')).toContainText('1 dish · 1 serving · 1 pts');
});
