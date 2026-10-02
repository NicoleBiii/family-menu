import { expect, test, type Page } from '@playwright/test';

// ORD-001 browser flows. The browser time zone becomes the household time zone at creation;
// pin it so the daylight-saving case behaves the same locally and in UTC CI.
test.use({ timezoneId: 'America/Toronto' });

function unique(label: string) {
  return `${label} ${test.info().project.name} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

function torontoDate(offsetDays: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

/** Next first Sunday of November (clocks repeat 01:00–02:00 in Toronto), a few days ahead. */
function nextFallBack() {
  const today = new Date();
  for (let year = today.getUTCFullYear(); ; year += 1) {
    const first = new Date(Date.UTC(year, 10, 1));
    const date = new Date(Date.UTC(year, 10, 1 + ((7 - first.getUTCDay()) % 7)));
    if (date.getTime() > today.getTime() + 3 * 86_400_000) return date.toISOString().slice(0, 10);
  }
}

async function setUp(page: Page, dish: string) {
  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page.getByRole('textbox', { name: 'Test account name' }).fill(unique('Planner'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Household name' }).fill(unique('Home'));
  await page.getByRole('button', { name: 'Create household' }).click();
  await expect(page.getByRole('button', { name: 'Create invitation link' })).toBeVisible();
  await page.getByRole('link', { name: 'Family Menu home' }).click();
  await page.getByRole('button', { name: 'Manage recipes & menu' }).click();
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await page.getByRole('textbox', { name: 'Recipe name' }).fill(dish);
  await page.getByRole('spinbutton', { name: 'Serves' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Points per serving' }).fill('4');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('button', { name: `View ${dish}` })).toBeVisible();
}

test('a dish is ordered from the menu for tomorrow, edited, and marked done', async ({ page }) => {
  await setUp(page, 'Dumpling night');
  await page.getByRole('button', { name: 'View Dumpling night' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add to basket' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Added Dumpling night to the basket.')).toBeVisible();
  await expect(page.locator('.basket-bar')).toContainText('1 dish · 3 servings · 12 pts');
  await page.getByRole('button', { name: 'Review basket' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'New meal order' })).toBeFocused();
  const servings = page.getByRole('spinbutton', { name: 'Servings for Dumpling night' });
  await expect(servings).toHaveValue('3');
  await expect(
    page.getByText('Times are in the household time zone, America/Toronto.'),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'Plan for later' }).check();
  await page.getByLabel('Date').fill(torontoDate(1));
  await page.getByLabel('Time').fill('19:00');
  await servings.fill('5');
  await page.getByRole('textbox', { name: 'Notes (optional)' }).fill('少放盐 please');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Place order' }).click();

  await expect(page).toHaveURL(/\/meals$/);
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved: Dumpling night for tomorrow at 19:00.' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tomorrow' })).toBeVisible();
  const card = page.getByRole('article', { name: 'Meal at 19:00' });
  await expect(card).toContainText('Dumpling night');
  await expect(card).toContainText('5 servings');
  await expect(card).toContainText('20 pts');
  await expect(card).toContainText('少放盐 please');

  await card.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByText('Dumpling night · as ordered')).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Servings for Dumpling night' }).fill('2');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(card).toContainText('2 servings');
  await expect(card).toContainText('8 pts');

  await card.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'Nothing planned yet' })).toBeVisible();
  await page.getByRole('button', { name: 'History' }).click();
  const done = page.getByRole('article', { name: 'Meal at 19:00' });
  await expect(done).toContainText('Done');
  await expect(done.getByRole('button', { name: 'Edit' })).toHaveCount(0);
});

test('a repeated daylight-saving time asks which one is meant; cancel removes the order', async ({
  page,
}) => {
  await setUp(page, 'Late snack');
  await page.getByRole('link', { name: 'Family Menu home' }).click();
  await page.getByRole('button', { name: 'Add Late snack to the basket' }).click();
  await page.getByRole('button', { name: 'Review basket' }).click();
  await page.getByRole('radio', { name: 'Plan for later' }).check();
  await page.getByLabel('Date').fill(nextFallBack());
  await page.getByLabel('Time').fill('01:30');
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('alert')).toContainText('happens twice');
  await expect(page.getByRole('button', { name: 'Place order' })).toBeDisabled();
  await page.getByRole('radio', { name: 'The second 01:30 (UTC-05:00)' }).check();
  await page.getByRole('button', { name: 'Place order' }).click();
  const card = page.getByRole('article', { name: 'Meal at 01:30' });
  await expect(card).toContainText('Late snack');

  page.once('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByRole('heading', { name: 'Nothing planned yet' })).toBeVisible();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('article', { name: 'Meal at 01:30' })).toContainText('Cancelled');
});

test('saving over another member’s newer order change shows a conflict', async ({ page }) => {
  await setUp(page, 'Soup');
  await page.getByRole('link', { name: 'Family Menu home' }).click();
  await page.getByRole('button', { name: 'Add Soup to the basket' }).click();
  await page.getByRole('button', { name: 'Review basket' }).click();
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();

  const session = await (await page.request.get('/api/auth/session')).json();
  const householdId = session.households[0].id;
  const [pending] = await (await page.request.get(`/api/households/${householdId}/orders`)).json();
  const changed = await page.request.put(`/api/households/${householdId}/orders/${pending.id}`, {
    headers: { 'X-CSRF-Token': session.csrfToken, Origin: 'http://127.0.0.1:4173' },
    data: {
      expectedRevision: 1,
      when: { type: 'scheduled', date: pending.mealDate, time: pending.mealTime },
      notes: 'Changed elsewhere',
      items: [{ itemId: pending.items[0].id, servings: 9 }],
    },
  });
  expect(changed.status()).toBe(200);

  await page.getByRole('textbox', { name: 'Notes (optional)' }).fill('My stale edit');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('Someone else changed this order');
  await page.getByRole('button', { name: /Load the latest version/ }).click();
  await expect(page.getByRole('textbox', { name: 'Notes (optional)' })).toHaveValue(
    'Changed elsewhere',
  );
});
