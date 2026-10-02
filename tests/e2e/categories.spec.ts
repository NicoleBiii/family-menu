import { expect, test, type Page } from '@playwright/test';

// UX-002 phase 2 browser flows (ADR 0007): household categories are managed by members, chosen
// in the recipe editor, filter the menu, and preset or AI suggestions are only created when a
// member explicitly accepts them.

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

async function addRecipe(page: Page, name: string, category?: string) {
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await page.getByRole('textbox', { name: 'Recipe name' }).fill(name);
  if (category) {
    await page.getByRole('combobox', { name: 'Category' }).selectOption({ label: category });
  }
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText(`Saved ${name}.`)).toBeVisible();
}

const fitsViewport = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('members manage categories, assign them to recipes and filter the menu', async ({ page }) => {
  await signInWithHousehold(page);
  await page.getByRole('button', { name: 'Categories' }).click();
  await expect(page.getByRole('heading', { name: 'Recipe categories' })).toBeFocused();
  await expect(page.getByText('No categories yet.')).toBeVisible();
  for (const name of ['Soups', 'Breakfast']) {
    await page.getByRole('textbox', { name: 'New category name' }).fill(name);
    await page.getByRole('button', { name: 'Add category' }).click();
    await expect(page.getByText(`Added ${name}.`)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Back to menu' }).click();

  await addRecipe(page, 'Lentil soup', 'Soups');
  await addRecipe(page, 'Buttered toast');
  const soupCard = page.getByRole('button', { name: 'View Lentil soup' });
  const toastCard = page.getByRole('button', { name: 'View Buttered toast' });
  await expect(soupCard).toContainText('Soups');

  const filters = page.getByRole('group', { name: 'Filter by category' });
  await filters.getByRole('button', { name: 'Soups' }).click();
  await expect(soupCard).toBeVisible();
  await expect(toastCard).toBeHidden();
  await filters.getByRole('button', { name: 'Uncategorised' }).click();
  await expect(toastCard).toBeVisible();
  await expect(soupCard).toBeHidden();
  await filters.getByRole('button', { name: 'Breakfast' }).click();
  await expect(page.getByRole('heading', { name: 'Your menu is empty' })).toBeVisible();
  await filters.getByRole('button', { name: 'All' }).click();
  await expect(soupCard).toBeVisible();
  expect(await fitsViewport(page)).toBe(true);

  // Renaming keeps the link; the card shows the new name.
  await page.getByRole('button', { name: 'Categories' }).click();
  await page.getByRole('button', { name: 'Rename Soups' }).click();
  await page.getByRole('textbox', { name: 'New name for Soups' }).fill('Soups & stews');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Renamed to Soups & stews.')).toBeVisible();

  // Deleting asks where the recipes go.
  await page.getByRole('button', { name: 'Delete Soups & stews' }).click();
  await expect(page.getByText('Its 1 recipes will not be deleted.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Move its recipes to' }).selectOption({
    label: 'Breakfast',
  });
  await page.getByRole('button', { name: 'Delete category' }).click();
  await expect(page.getByText('Deleted Soups & stews. 1 recipes moved.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to menu' }).click();
  await expect(soupCard).toContainText('Breakfast');
  await soupCard.click();
  await expect(page.getByRole('dialog')).toContainText('Breakfast');
  await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveValue(/.+/);
  await page.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Uncategorised' });
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(soupCard).not.toContainText('Breakfast');
});

test('a starter recipe suggests a category that is created only when the member accepts it', async ({
  page,
}) => {
  await signInWithHousehold(page);
  await page.getByRole('button', { name: /^View Tomato & egg stir-fry/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save to our menu' }).click();
  await expect(page.getByText('Suggested category: Mains')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveValue('');
  await page.getByRole('button', { name: 'Create “Mains”' }).click();
  await expect(page.getByRole('combobox', { name: 'Category' })).not.toHaveValue('');
  await expect(page.getByText('Suggested category: Mains')).toBeHidden();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(
    page.getByRole('button', { name: /^View Tomato & egg stir-fry/ }).first(),
  ).toContainText('Mains');

  // The next starter with the same suggestion picks the existing category without asking.
  await page.getByRole('button', { name: /^View Mapo tofu/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save to our menu' }).click();
  const select = page.getByRole('combobox', { name: 'Category' });
  await expect(select.locator('option:checked')).toHaveText('Mains');
  await expect(page.getByRole('button', { name: /^Create/ })).toBeHidden();

  // Ignoring a suggestion creates nothing.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: /^View Fluffy pancakes/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save to our menu' }).click();
  await expect(page.getByText('Suggested category: Breakfast')).toBeVisible();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Categories' }).click();
  await expect(page.getByRole('list').getByText('Breakfast')).toHaveCount(0);
  await expect(page.getByRole('list')).toContainText('Mains');
});

test('an AI draft suggests a new category; the member creates it before saving', async ({
  page,
}) => {
  await signInWithHousehold(page);
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  await expect(page.getByText(/category names are sent/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Dish name' }).fill('Pan-fried dumplings');
  await page.getByRole('button', { name: 'Write a draft' }).click();
  await expect(page.getByRole('heading', { name: 'Review the AI draft' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Suggested category: Weeknight dinners')).toBeVisible();
  await page.getByRole('button', { name: 'Create “Weeknight dinners”' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Category' }).locator('option:checked'),
  ).toHaveText('Weeknight dinners');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('button', { name: 'View Pan-fried dumplings' })).toContainText(
    'Weeknight dinners',
  );
});

test('category controls work in Chinese', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-CN' });
  try {
    const page = await context.newPage();
    await page.goto('/household');
    await page.getByRole('link', { name: '使用 Google 登录' }).click();
    await page.getByRole('textbox', { name: 'Test account name' }).fill(unique('分类'));
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('textbox', { name: '家庭名称' }).fill(unique('分类家庭'));
    await page.getByRole('button', { name: '创建家庭' }).click();
    await page.getByRole('link', { name: '家庭菜单首页' }).click();
    await page.getByRole('button', { name: '管理菜谱与菜单' }).click();
    await page
      .getByRole('button', { name: /^查看Tomato/ })
      .first()
      .click();
    await page.getByRole('dialog').getByRole('button', { name: '保存到家庭菜单' }).click();
    await expect(page.getByText('建议分类：主菜')).toBeVisible();
    await page.getByRole('button', { name: '创建“主菜”' }).click();
    await page.getByRole('button', { name: '保存菜谱' }).click();
    await page
      .getByRole('group', { name: '按分类筛选' })
      .getByRole('button', { name: '主菜' })
      .click();
    await expect(page.getByRole('button', { name: /^查看Tomato/ }).first()).toContainText('主菜');
    expect(await fitsViewport(page)).toBe(true);
  } finally {
    await context.close();
  }
});
