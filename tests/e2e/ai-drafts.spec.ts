import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// AI-001 browser flows with the deterministic mock provider: a draft is reviewed and edited
// before it reaches the menu, can be discarded without changing the menu, and a provider
// failure leaves manual entry one step away.

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
  await page.getByRole('navigation').getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('heading', { name: 'Your household menu' })).toBeVisible();
}

async function requestDraft(page: Page, dish: string) {
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  await expect(page.getByRole('heading', { name: 'Draft a recipe with AI' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Dish name' }).fill(dish);
  await page.getByRole('textbox', { name: 'Preferences (optional)' }).fill('mild');
  await page.getByRole('button', { name: 'Write a draft' }).click();
}

const fitsViewport = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('an AI draft is reviewed and edited before it is saved to the menu', async ({ page }) => {
  await signInWithHousehold(page);
  await requestDraft(page, '番茄炒蛋 Tomato eggs');
  await expect(page.getByRole('heading', { name: 'Review the AI draft' })).toBeFocused({
    timeout: 15_000,
  });
  await expect(page.getByText('It is not in your menu yet.')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
  expect(await fitsViewport(page)).toBe(true);

  await expect(page.getByRole('textbox', { name: 'Recipe name' })).toHaveValue(
    '番茄炒蛋 Tomato eggs',
  );
  await page.getByRole('textbox', { name: 'Recipe name' }).fill('Grandma’s tomato eggs');
  await page.getByRole('spinbutton', { name: 'Points per serving' }).fill('5');
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await expect(page.getByText('Saved Grandma’s tomato eggs.')).toBeVisible();
  await page.getByRole('button', { name: 'View Grandma’s tomato eggs' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('1 tbsp Olive oil');
  await expect(dialog).toContainText('5 points per serving');
  await expect(dialog).toContainText('started from an AI draft');
});

test('discarding a draft leaves the menu unchanged; a kept draft can be resumed', async ({
  page,
}) => {
  await signInWithHousehold(page);
  await requestDraft(page, 'Congee');
  await expect(page.getByRole('heading', { name: 'Review the AI draft' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Decide later' }).click();
  await expect(page.getByRole('heading', { name: 'Unfinished drafts' })).toBeVisible();
  await page.getByRole('button', { name: 'Review draft for Congee' }).click();
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page.getByText('Draft discarded. Your menu is unchanged.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your menu is empty' })).toBeVisible();
});

test('a provider failure explains itself and offers manual entry', async ({ page }) => {
  await signInWithHousehold(page);
  await requestDraft(page, 'Mock provider failure');
  await expect(page.getByRole('alert')).toContainText(
    'The AI service could not be reached or returned an error.',
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: 'Enter the recipe by hand instead' }).click();
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeFocused();
});
