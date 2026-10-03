import { expect, test, type Page } from '@playwright/test';

// UX-002 phase 3 and UX-003 browser flows: Home lists dishes by category beside a category
// rail and collects them in a basket kept in this browser session; a separate confirmation page
// places exactly one order, and emptying the basket creates none.

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
  await page.getByRole('link', { name: 'Family Menu home' }).click();
  return { orderCount };
}

test('dishes are collected by category and placed as one order', async ({ page }) => {
  const { orderCount } = await setUp(page);
  await expect(page).toHaveURL(/\/$/);
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
  await expect(page.locator('.basket-count')).toHaveText('4');

  // Search only changes what is shown, not the basket; the rail jumps to a category.
  await page.getByRole('textbox', { name: 'Search dishes' }).fill('lentil');
  await expect(page.getByRole('button', { name: /Miso soup/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search dishes' }).fill('');
  const rail = page.getByRole('navigation', { name: 'Categories' });
  // The rail shows how many servings each category already has in the basket.
  await expect(rail.getByRole('link', { name: 'Soups 3 in basket', exact: true })).toBeVisible();
  await expect(
    rail.getByRole('link', { name: 'Uncategorised 1 in basket', exact: true }),
  ).toBeVisible();
  // Chosen dishes are marked in the list, with their servings.
  const miso = page.getByRole('listitem').filter({ hasText: 'Miso soup' });
  await expect(miso).toHaveClass(/in-basket/);
  await expect(miso).toContainText('In basket · 3');
  await expect(page.getByRole('listitem').filter({ hasText: 'Lentil soup' })).not.toHaveClass(
    /in-basket/,
  );
  await rail.getByRole('link', { name: 'Uncategorised' }).click();
  await expect(page.getByRole('heading', { name: 'Uncategorised' })).toBeInViewport();
  await expect(page.locator('.basket-bar')).toContainText('2 dishes');

  // The basket survives going to another page, switching language and reloading.
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Shopping' })
    .click();
  await page.getByRole('button', { name: '简体中文' }).click();
  await page.getByRole('link', { name: '家庭菜单首页' }).click();
  await expect(page.locator('.basket-bar')).toContainText('2 道菜 · 4 份 · 10 积分');
  await page.getByRole('button', { name: 'English' }).click();
  await page.reload();
  await expect(page.locator('.basket-bar')).toContainText('2 dishes · 4 servings · 10 pts');
  expect(await orderCount()).toBe(0);

  await page.getByRole('button', { name: 'Review basket' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'Confirm your order', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New meal order' })).toBeFocused();
  await expect(page.getByRole('spinbutton', { name: 'Servings for Miso soup' })).toHaveValue('3');
  await page.getByRole('spinbutton', { name: 'Servings for Garlic bread' }).fill('2');
  await page.getByRole('textbox', { name: 'Notes (optional)' }).fill('Dinner for the cousins');
  // Going back for another dish (also with the browser's Back) keeps the review edits.
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Add Lentil soup to the basket' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('textbox', { name: 'Notes (optional)' })).toHaveValue(
    'Dinner for the cousins',
  );
  await page.getByRole('button', { name: 'Add more dishes' }).first().click();
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

  await expect(page).toHaveURL(/\/meals$/);
  await expect(page.getByText(/Saved: Miso soup, Garlic bread/)).toBeVisible();
  // Orders shows only pending and past orders; dishes are browsed on Home.
  await expect(page.getByRole('group', { name: 'Order views' }).getByRole('button')).toHaveText([
    'Upcoming',
    'History',
  ]);
  const card = page.getByRole('article').first();
  await expect(card).toContainText('Miso soup');
  await expect(card).toContainText('Garlic bread');
  await expect(card).toContainText('11 pts');
  await expect(card).toContainText('Dinner for the cousins');
  expect(await orderCount()).toBe(1);

  // The placed basket is empty again; a reload does not resubmit it.
  await page.getByRole('link', { name: 'Family Menu home' }).click();
  await expect(page.getByRole('button', { name: 'Add Miso soup to the basket' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Add more dishes' }).first().click();
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
  await page.getByRole('button', { name: 'Add Lentil soup to the basket' }).click();
  const session = await (await page.request.get('/api/auth/session')).json();
  const householdId = session.households[0].id;
  const archive = async (name: string) => {
    const recipes = await (await page.request.get(`/api/households/${householdId}/recipes`)).json();
    const recipe = recipes.find((candidate: { name: string }) => candidate.name === name);
    const archived = await page.request.post(
      `/api/households/${householdId}/recipes/${recipe.id}/archive`,
      {
        headers: { 'X-CSRF-Token': session.csrfToken, Origin: 'http://127.0.0.1:4173' },
        data: { expectedRevision: recipe.revision },
      },
    );
    expect(archived.status()).toBe(200);
  };
  await archive('Miso soup');
  await page.reload();
  await expect(page.getByText('Some dishes are no longer on the menu')).toBeVisible();
  await expect(page.locator('.basket-bar')).toContainText('2 dishes · 5 servings · 9 pts');

  // Opening the confirmation page directly removes it there too, before the form is filled.
  await archive('Lentil soup');
  await page.goto('/checkout');
  await expect(page.getByText('Some dishes are no longer on the menu')).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: /^Servings for/ })).toHaveCount(1);
  await expect(page.getByRole('spinbutton', { name: 'Servings for Garlic bread' })).toHaveValue(
    '1',
  );
});
