import { expect, test, type Locator, type Page } from '@playwright/test';

// UX-001 / AC-14: the core workflow — create a household, add a recipe, order it and read the
// shopping list — works with the keyboard alone at 360 px, and every control reached by Tab is
// visible, not hidden behind the fixed bottom navigation. (The provider stub's own sign-in page
// is not part of the app and is filled normally.)
test.use({ viewport: { width: 360, height: 780 }, timezoneId: 'America/Toronto' });

function unique(label: string) {
  return `${label} ${test.info().project.name} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

/** Presses Tab until `target` has focus, then checks it is on screen and not covered. */
async function tabTo(page: Page, target: Locator, maxPresses = 120) {
  for (let presses = 0; presses < maxPresses; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) {
      break;
    }
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
  const visible = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const x = box.left + Math.min(box.width / 2, 20);
    const y = box.top + Math.min(box.height / 2, 12);
    const hit = document.elementFromPoint(x, y);
    return (
      box.top >= 0 &&
      box.bottom <= window.innerHeight &&
      hit !== null &&
      (hit === element || element.contains(hit) || hit.contains(element))
    );
  });
  expect(visible, `${target} is visible and not covered`).toBe(true);
}

async function typeInto(page: Page, target: Locator, text: string) {
  await tabTo(page, target);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
}

test('the core workflow works with the keyboard alone at 360 px', async ({ page }) => {
  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page.getByRole('textbox', { name: 'Test account name' }).fill(unique('Keys'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Start your household' })).toBeVisible();

  await typeInto(page, page.getByRole('textbox', { name: 'Household name' }), unique('Home'));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Create invitation link' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await tabTo(page, page.getByRole('link', { name: 'Family Menu home' }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('button', { name: 'Manage recipes & menu' }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('button', { name: 'Add recipe' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeFocused();

  await typeInto(page, page.getByRole('textbox', { name: 'Recipe name' }), 'Keyboard noodles');
  await typeInto(page, page.getByRole('spinbutton', { name: 'Serves' }), '2');
  await tabTo(page, page.getByRole('button', { name: 'Add ingredient' }));
  await page.keyboard.press('Enter');
  const line = page.getByRole('group', { name: 'Ingredient 1' });
  await typeInto(page, line.getByRole('textbox', { name: 'Name' }), 'Noodles');
  await typeInto(page, line.getByRole('textbox', { name: 'Amount' }), '200');
  await tabTo(page, line.getByRole('combobox', { name: 'Unit' }));
  await page.keyboard.type('g'); // type-ahead selects "g" on every platform
  await expect(line.getByRole('combobox', { name: 'Unit' })).toHaveValue('g');
  await tabTo(page, page.getByRole('button', { name: 'Save recipe' }));
  await page.keyboard.press('Enter');

  const card = page.getByRole('button', { name: 'View Keyboard noodles' });
  await tabTo(page, card);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await tabTo(page, dialog.getByRole('button', { name: 'Add to basket' }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('button', { name: 'One serving more of Keyboard noodles' }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('button', { name: 'Review basket' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'New meal order' })).toBeFocused();
  await expect(page.getByRole('spinbutton', { name: 'Servings for Keyboard noodles' })).toHaveValue(
    '3',
  );
  await tabTo(page, page.getByRole('button', { name: 'Place order' }));
  await page.keyboard.press('Enter');
  const order = page.getByRole('article').first();
  await expect(order).toContainText('Keyboard noodles');
  await tabTo(page, order.getByRole('button', { name: 'Done' }));

  await tabTo(page, nav.getByRole('button', { name: 'Shopping' }));
  await page.keyboard.press('Enter');
  const noodles = page
    .getByRole('list', { name: 'Combined shopping list' })
    .getByRole('listitem')
    .filter({ hasText: 'Noodles' });
  await expect(noodles).toContainText('300 g');
  await tabTo(page, page.getByRole('button', { name: 'By day' }));
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'By day' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
