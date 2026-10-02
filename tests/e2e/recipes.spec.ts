import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

// REC-001 browser flows. Sign-in uses the test-only provider stub (tests/e2e/provider-stub.mjs).

function unique(label: string) {
  return `${label} ${test.info().project.name} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

async function signInWithHousehold(page: Page) {
  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page.getByRole('textbox', { name: 'Test account name' }).fill(unique('Cook'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Household name' }).fill(unique('Kitchen'));
  await page.getByRole('button', { name: 'Create household' }).click();
  await expect(page.getByRole('button', { name: 'Create invitation link' })).toBeVisible();
  await page.getByRole('link', { name: 'Family Menu home' }).click();
  await page.getByRole('button', { name: 'Manage recipes & menu' }).click();
  await expect(page.getByRole('heading', { name: 'Your household menu' })).toBeVisible();
}

const fitsViewport = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('a member adds, edits, archives and restores a manual recipe', async ({ page }) => {
  await signInWithHousehold(page);
  await expect(page.getByRole('heading', { name: 'Your menu is empty' })).toBeVisible();

  await page.getByRole('button', { name: 'Add recipe' }).click();
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Recipe name' }).fill('奶奶的饺子 Dumplings');
  await page.getByRole('spinbutton', { name: 'Serves' }).fill('4');
  await page.getByRole('spinbutton', { name: 'Points per serving' }).fill('8');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  const first = page.getByRole('group', { name: 'Ingredient 1' });
  await first.getByRole('textbox', { name: 'Name' }).fill('ground pork');
  await first.getByRole('textbox', { name: 'Amount' }).fill('300');
  await first.getByRole('combobox', { name: 'Unit' }).selectOption('g');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  const second = page.getByRole('group', { name: 'Ingredient 2' });
  await second.getByRole('textbox', { name: 'Name' }).fill('salt');
  await second.getByRole('textbox', { name: 'Note' }).fill('to taste');
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByRole('textbox', { name: 'Step 1' }).fill('Fold and boil.');
  expect(await fitsViewport(page)).toBe(true);
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await expect(page.getByText('Saved 奶奶的饺子 Dumplings.')).toBeVisible();
  const card = page.getByRole('button', { name: 'View 奶奶的饺子 Dumplings' });
  await card.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('300 g ground pork');
  await expect(dialog).toContainText('salt (to taste)');
  await expect(dialog).toContainText('8 points per serving');
  await expect(dialog).toContainText('Fold and boil.');

  await dialog.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox', { name: 'Recipe name' }).fill('Dumplings for Sunday');
  await page.getByRole('button', { name: 'Remove ingredient 2' }).click();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'View Dumplings for Sunday' }).click();
  await expect(dialog).not.toContainText('salt');

  await dialog.getByRole('button', { name: 'Archive' }).click();
  await expect(dialog).toContainText('ARCHIVED RECIPE');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Your menu is empty' })).toBeVisible();
  await page.getByRole('button', { name: 'Archived (1)' }).click();
  await page.getByRole('button', { name: 'View Dumplings for Sunday' }).click();
  await dialog.getByRole('button', { name: 'Restore to menu' }).click();
  await expect(dialog.getByRole('button', { name: 'Edit' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Archived (0)' }).click();
  await expect(page.getByRole('button', { name: 'View Dumplings for Sunday' })).toBeVisible();
});

test('a starter recipe is saved as an editable household copy', async ({ page }) => {
  await signInWithHousehold(page);
  await page.getByRole('button', { name: 'View Tomato & egg stir-fry 番茄炒蛋' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save to our menu' }).click();
  await expect(page.getByRole('heading', { name: 'Save a starter recipe' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Recipe name' })).toHaveValue(
    'Tomato & egg stir-fry 番茄炒蛋',
  );
  await expect(
    page.getByRole('group', { name: 'Ingredient 1' }).getByRole('textbox', { name: 'Name' }),
  ).toHaveValue('egg');
  await page.getByRole('spinbutton', { name: 'Points per serving' }).fill('5');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  const menu = page.locator('section', {
    has: page.getByRole('heading', { name: 'Your household menu' }),
  });
  await expect(
    menu.getByRole('button', { name: 'View Tomato & egg stir-fry 番茄炒蛋' }),
  ).toContainText('5 pts / serving');
  await menu.getByRole('button', { name: 'View Tomato & egg stir-fry 番茄炒蛋' }).click();
  await expect(page.getByRole('dialog')).toContainText('from a starter recipe');
});

test('saving over another member’s newer change shows a conflict and can load the latest', async ({
  page,
}) => {
  await signInWithHousehold(page);
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await page.getByRole('textbox', { name: 'Recipe name' }).fill('Original name');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'View Original name' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();

  // Another member saves first (simulated through the API with a valid session).
  const session = await (await page.request.get('/api/auth/session')).json();
  const householdId = session.households[0].id;
  const recipes = await (await page.request.get(`/api/households/${householdId}/recipes`)).json();
  const changed = await page.request.put(
    `/api/households/${householdId}/recipes/${recipes[0].id}`,
    {
      headers: { 'X-CSRF-Token': session.csrfToken, Origin: 'http://127.0.0.1:4173' },
      data: { expectedRevision: 1, name: 'Changed elsewhere', servings: 2 },
    },
  );
  expect(changed.status()).toBe(200);

  await page.getByRole('textbox', { name: 'Recipe name' }).fill('My stale edit');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('alert')).toContainText('Someone else changed this recipe');
  await page.getByRole('button', { name: /Load the latest version/ }).click();
  await expect(page.getByRole('textbox', { name: 'Recipe name' })).toHaveValue('Changed elsewhere');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('button', { name: 'View Changed elsewhere' })).toBeVisible();
});

test('a member adds and removes a recipe photo, shown on the card and in the dialog', async ({
  page,
}) => {
  await signInWithHousehold(page);
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await page.getByRole('textbox', { name: 'Recipe name' }).fill('Photo soup');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'View Photo soup' }).click();
  const dialog = page.getByRole('dialog');

  const photo = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 220, g: 150, b: 60 } },
  })
    .png()
    .toBuffer();
  await dialog.locator('.photo-dropzone').evaluate((target, base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'soup.png', { type: 'image/png' }));
    target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  }, photo.toString('base64'));
  const shown = dialog.getByRole('img', { name: 'Photo of Photo soup' });
  await expect(shown).toBeVisible();
  expect(await shown.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(dialog.getByText('Change photo')).toBeVisible();
  await dialog
    .getByLabel('Change photo')
    .setInputFiles({ name: 'soup.png', mimeType: 'image/png', buffer: photo });
  await expect(shown).toBeVisible();
  expect(await fitsViewport(page)).toBe(true);

  await page.keyboard.press('Escape');
  const cardImage = page.getByRole('button', { name: 'View Photo soup' }).locator('img');
  await expect(cardImage).toBeVisible();

  await page.getByRole('button', { name: 'View Photo soup' }).click();
  await dialog.getByRole('button', { name: 'Remove photo' }).click();
  await expect(dialog.getByText('Add photo')).toBeVisible();
  await expect(shown).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(cardImage).toHaveCount(0);
});
