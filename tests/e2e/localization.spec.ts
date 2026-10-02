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
    await page.goto('/recipes');
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

test('Chinese recipe and order forms keep member content when switching language', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'zh-CN' });
  try {
    const page = await context.newPage();
    await page.goto('/household');
    await page.getByRole('link', { name: '使用 Google 登录' }).click();
    await page.getByRole('textbox', { name: 'Test account name' }).fill('Chinese flow member');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('textbox', { name: '家庭名称' }).fill('双语测试家庭');
    await page.getByRole('button', { name: '创建家庭' }).click();
    await page.getByRole('link', { name: '家庭菜单首页' }).click();
    await page.getByRole('button', { name: '管理菜谱与菜单' }).click();
    await page.getByRole('button', { name: '添加菜谱' }).click();
    await page.getByRole('textbox', { name: '菜名' }).fill('西红柿蛋汤');
    await page.getByRole('button', { name: '添加食材' }).click();
    await page
      .getByRole('group', { name: '食材 1' })
      .getByRole('textbox', { name: '名称' })
      .fill('番茄');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('textbox', { name: 'Recipe name' })).toHaveValue('西红柿蛋汤');
    await expect(
      page.getByRole('group', { name: 'Ingredient 1' }).getByRole('textbox', { name: 'Name' }),
    ).toHaveValue('番茄');
    await page.getByRole('button', { name: '简体中文' }).click();
    await page.getByRole('button', { name: '保存菜谱' }).click();
    await page.getByRole('button', { name: '查看西红柿蛋汤' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '加入点单篮' }).click();
    await page.getByRole('button', { name: '查看点单篮' }).click();
    const notes = page.getByRole('textbox', { name: '备注（选填）' });
    await notes.fill('少盐');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('textbox', { name: 'Notes (optional)' })).toHaveValue('少盐');
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByRole('article').first()).toContainText('西红柿蛋汤');
    await page.getByRole('button', { name: '简体中文' }).click();
    await page.getByRole('navigation').getByRole('button', { name: '购物清单' }).click();
    await expect(page.getByRole('list', { name: '汇总购物清单' })).toContainText('番茄');
  } finally {
    await context.close();
  }
});

test('an invited member with a Chinese browser signs in and joins in Chinese', async ({
  browser,
  page,
}) => {
  const suffix = `${test.info().project.name} ${Date.now()}`;
  const householdName = `Bilingual home ${suffix}`;
  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page.getByRole('textbox', { name: 'Test account name' }).fill(`Owner ${suffix}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Household name' }).fill(householdName);
  await page.getByRole('button', { name: 'Create household' }).click();
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  const link = await page
    .getByRole('textbox', { name: 'New invitation link (shown once)' })
    .inputValue();

  const context = await browser.newContext({ locale: 'zh-CN' });
  try {
    const member = await context.newPage();
    await member.goto(link);
    await expect(member.locator('html')).toHaveAttribute('lang', 'zh-Hans');
    await expect(member.getByRole('heading', { name: '加入家庭' })).toBeVisible();
    await member.getByRole('link', { name: '使用 Google 登录' }).click();
    await member.getByRole('textbox', { name: 'Test account name' }).fill(`成员 ${suffix}`);
    await member.getByRole('button', { name: 'Continue' }).click();
    await expect(member.getByRole('heading', { name: householdName })).toBeVisible();
    await member.getByRole('button', { name: '加入家庭' }).click();
    await expect(member.getByText('你的身份：成员')).toBeVisible();
    await expect(member.getByText(`成员 ${suffix}（你）`)).toBeVisible();
  } finally {
    await context.close();
  }
});
