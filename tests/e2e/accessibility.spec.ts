import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// UX-001: automated WCAG 2.2 A/AA checks (axe-core) on every main screen, desktop and 360 px.
// Automated rules find a subset of accessibility problems; they do not replace a manual
// screen-reader and real-device review.
test.use({ timezoneId: 'America/Toronto' });

async function expectNoViolations(page: Page, screen: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const data = node.any[0]?.data as
        { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
      const colors = data?.fgColor
        ? ` ${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}`
        : '';
      return `${violation.id}: ${node.target.join(' ')}${colors}`;
    }),
  );
  expect.soft(summary, screen).toEqual([]);
}

function unique(label: string) {
  return `${label} ${test.info().project.name} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

test('signed-out screens have no automatically detectable violations', async ({ page }) => {
  await page.goto('/recipes');
  await expect(page.getByRole('button', { name: /^View / }).first()).toBeVisible();
  await expectNoViolations(page, 'signed-out menu');
  await page
    .getByRole('button', { name: /^View / })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoViolations(page, 'starter recipe dialog');
  await page.keyboard.press('Escape');
  for (const [path, heading] of [
    ['/', 'Your household menu'],
    ['/household', 'Household'],
    ['/meals', 'Orders'],
    ['/shopping', 'Shopping'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expectNoViolations(page, `signed-out ${heading}`);
  }
});

test('Chinese signed-out screens keep labels and have no automatically detectable violations', async ({
  page,
}) => {
  await page.goto('/recipes');
  await page.getByRole('button', { name: '简体中文' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await expect(page.getByRole('button', { name: /^查看/ }).first()).toBeVisible();
  await expectNoViolations(page, 'Chinese menu');
  for (const [path, heading] of [
    ['/', '家庭菜单'],
    ['/household', '家庭'],
    ['/meals', '订单'],
    ['/shopping', '购物清单'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expectNoViolations(page, `Chinese ${heading}`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test('signed-in screens have no automatically detectable violations', async ({ page }) => {
  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page.getByRole('textbox', { name: 'Test account name' }).fill(unique('Axe'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectNoViolations(page, 'household without a household');
  await page.getByRole('textbox', { name: 'Household name' }).fill(unique('Home'));
  await page.getByRole('button', { name: 'Create household' }).click();
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  await expect(page.getByRole('textbox', { name: /New invitation link/ })).toBeVisible();
  await expectNoViolations(page, 'household owner view');

  await page.getByRole('link', { name: 'Family Menu home' }).click();
  await page.getByRole('button', { name: 'Manage recipes & menu' }).click();
  await expect(page.getByRole('heading', { name: 'Your menu is empty' })).toBeVisible();
  await expectNoViolations(page, 'empty household menu');
  await page.getByRole('button', { name: 'Categories' }).click();
  await page.getByRole('textbox', { name: 'New category name' }).fill('Axe dishes');
  await page.getByRole('button', { name: 'Add category' }).click();
  await page.getByRole('button', { name: 'Delete Axe dishes' }).click();
  await expectNoViolations(page, 'category manager');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Back to menu' }).click();
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await page.getByRole('button', { name: 'Add step' }).click();
  await expectNoViolations(page, 'recipe editor');
  await page.getByRole('textbox', { name: 'Recipe name' }).fill('Axe soup');
  await page
    .getByRole('group', { name: 'Ingredient 1' })
    .getByRole('textbox', { name: 'Name' })
    .fill('Water');
  await page.getByRole('textbox', { name: 'Step 1' }).fill('Boil.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'View Axe soup' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoViolations(page, 'household recipe dialog');

  await page.getByRole('dialog').getByRole('button', { name: 'Add to basket' }).click();
  await expect(page.locator('.basket-bar')).toBeVisible();
  await expectNoViolations(page, 'dish browser with basket');
  await page.getByRole('button', { name: 'Review basket' }).click();
  await expect(page.getByRole('heading', { name: 'New meal order' })).toBeVisible();
  await expectNoViolations(page, 'order confirmation');
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('article').first()).toBeVisible();
  await expectNoViolations(page, 'meals list');
  await page.getByRole('button', { name: 'History' }).click();
  await expectNoViolations(page, 'meals history');

  await page.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
  await expect(page.getByRole('list', { name: 'Combined shopping list' })).toBeVisible();
  await expectNoViolations(page, 'shopping combined');
  await page.getByRole('button', { name: 'By day' }).click();
  await expectNoViolations(page, 'shopping by day');
});
