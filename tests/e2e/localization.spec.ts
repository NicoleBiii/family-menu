import { expect, test } from '@playwright/test';

test('browser language selects Chinese; an explicit choice persists without clearing a form', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'zh-CN' });
  try {
    const page = await context.newPage();
    await page.goto('/household');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
    await expect(page.getByRole('heading', { name: '和喜欢的人一起分享。' })).toBeVisible();
    await page.getByRole('link', { name: '使用 Google 登录' }).click();
    await page.getByRole('textbox', { name: 'Test account name' }).fill('Language test member');
    await page.getByRole('button', { name: 'Continue' }).click();
    const name = page.getByRole('textbox', { name: '家庭名称' });
    await name.fill('语言测试家庭');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('textbox', { name: 'Household name' })).toHaveValue('语言测试家庭');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Create a household' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('switching language keeps menu search and recipe text as written', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-CN' });
  try {
    const page = await context.newPage();
    await page.goto('/');
    const search = page.getByRole('textbox', { name: '搜索菜谱' });
    await search.fill('sesame');
    await expect(page.getByRole('button', { name: '查看Sesame noodle bowl' })).toBeVisible();
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('textbox', { name: 'Search recipes' })).toHaveValue('sesame');
    await expect(page.getByRole('button', { name: 'View Sesame noodle bowl' })).toBeVisible();
  } finally {
    await context.close();
  }
});
