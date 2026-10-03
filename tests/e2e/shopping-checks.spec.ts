import { expect, test, type Browser, type Page } from '@playwright/test';

// UX-002 phase 4 browser flows (ADR 0009): household members share shopping checks; bought
// lines move below, later demand returns only the extra amount, stale checks are refused and
// refreshed, and undo reopens a line while history keeps it.
test.use({ timezoneId: 'America/Toronto' });

function unique(label: string) {
  return `${label} ${test.info().project.name} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

async function signIn(page: Page, name: string) {
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page.getByRole('textbox', { name: 'Test account name' }).fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** An owner and a joined member, plus an API helper acting as the owner. */
async function twoMembers(page: Page, browser: Browser) {
  const memberName = unique('Ben');
  await page.goto('/household');
  await signIn(page, unique('Ana'));
  await page.getByRole('textbox', { name: 'Household name' }).fill(unique('Shared home'));
  await page.getByRole('button', { name: 'Create household' }).click();
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  const link = await page
    .getByRole('textbox', { name: 'New invitation link (shown once)' })
    .inputValue();
  const memberContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const member = await memberContext.newPage();
  await member.goto(link);
  await signIn(member, memberName);
  await member.getByRole('button', { name: 'Join household' }).click();
  await expect(member.getByText(`${memberName} (you)`)).toBeVisible();

  const session = await (await page.request.get('/api/auth/session')).json();
  const householdId: string = session.households[0].id;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api/households/${householdId}${path}`, {
      headers: { 'X-CSRF-Token': session.csrfToken, Origin: 'http://127.0.0.1:4173' },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const omelette = await post('/recipes', {
    requestId: crypto.randomUUID(),
    name: 'Omelette',
    servings: 1,
    steps: [],
    ingredients: [
      { name: 'Egg', quantity: '2' },
      { name: 'Butter', quantity: '10', unit: 'g' },
    ],
  });
  const orderOmelette = () =>
    post('/orders', {
      requestId: crypto.randomUUID(),
      when: { type: 'now' },
      items: [{ recipeId: omelette.id, servings: 1 }],
    });
  return { member, memberContext, memberName, orderOmelette, post, omelette };
}

const openList = (page: Page) => page.getByRole('list', { name: 'Combined shopping list' });
const boughtList = (page: Page) => page.getByRole('list', { name: 'Bought items' });
const refresh = (page: Page) => page.getByRole('button', { name: 'Refresh shopping list' }).click();

test('members share checks; only demand added later returns to the list', async ({
  page,
  browser,
}) => {
  const { member, memberContext, memberName, orderOmelette } = await twoMembers(page, browser);
  try {
    await orderOmelette();
    await member.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
    await member.getByRole('checkbox', { name: 'Bought Egg: 2 whole' }).check();
    await expect(boughtList(member)).toContainText('Egg');
    await expect(boughtList(member)).toContainText(`Bought by ${memberName}`);
    await expect(openList(member)).not.toContainText('Egg');
    await expect(openList(member)).toContainText('Butter');

    await page.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
    await expect(page.getByRole('checkbox', { name: 'Not bought yet: Egg' })).toBeChecked();

    // Another order adds 2 eggs: only those are to buy; history keeps the first 2.
    await orderOmelette();
    await refresh(page);
    const egg = openList(page).getByRole('listitem').filter({ hasText: 'Egg' });
    await expect(egg).toContainText('2 whole');
    await expect(egg).toContainText('Already bought 2 whole; this is the rest.');
    await page.getByRole('button', { name: 'History' }).click();
    const history = page.getByRole('list', { name: 'History' });
    await expect(history).toContainText('Egg');
    await expect(history).toContainText('2 whole');
    await expect(history).toContainText(`Bought by ${memberName}`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    // Both members see the same list; a check from an outdated view is refused and refreshed.
    await page.getByRole('button', { name: 'Combined' }).click();
    await refresh(member);
    await page.getByRole('checkbox', { name: 'Bought Butter: 20 g' }).check();
    await expect(page.getByRole('checkbox', { name: 'Not bought yet: Butter' })).toBeChecked();
    await member.getByRole('checkbox', { name: 'Bought Butter: 20 g' }).check();
    await expect(member.getByRole('alert')).toContainText('The shopping list changed');
    await expect(member.getByRole('checkbox', { name: 'Not bought yet: Butter' })).toBeChecked();
    await member.getByRole('button', { name: 'History' }).click();
    await expect(member.getByRole('list', { name: 'History' }).getByRole('listitem')).toHaveCount(
      2,
    );
  } finally {
    await memberContext.close();
  }
});

test('unchecking undoes the purchase; history keeps it as undone, in both languages', async ({
  page,
  browser,
}) => {
  const { member, memberContext, orderOmelette } = await twoMembers(page, browser);
  try {
    await orderOmelette();
    await page.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
    await page.getByRole('checkbox', { name: 'Bought Egg: 2 whole' }).check();
    await page.getByRole('checkbox', { name: 'Not bought yet: Egg' }).uncheck();
    await expect(page.getByRole('checkbox', { name: 'Bought Egg: 2 whole' })).not.toBeChecked();
    await expect(boughtList(page)).toHaveCount(0);

    await page.getByRole('button', { name: '简体中文' }).click();
    await page.getByRole('button', { name: '购买记录' }).click();
    const history = page.getByRole('list', { name: '购买记录' });
    await expect(history).toContainText('已撤销');
    await page.getByRole('button', { name: '汇总' }).click();
    await page.getByRole('checkbox', { name: '已买 Egg：2 个' }).check();
    await expect(page.getByRole('list', { name: '已买的食材' })).toContainText('Egg');

    await member.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
    await expect(member.getByRole('checkbox', { name: 'Not bought yet: Egg' })).toBeChecked();
  } finally {
    await memberContext.close();
  }
});

test('by day, each dish’s ingredients are checked on their own and feed the combined list', async ({
  page,
  browser,
}) => {
  const { member, memberContext, memberName, post, omelette } = await twoMembers(page, browser);
  try {
    const friedRice = await post('/recipes', {
      requestId: crypto.randomUUID(),
      name: 'Fried rice',
      servings: 1,
      steps: [],
      ingredients: [
        { name: 'Egg', quantity: '1' },
        { name: 'Butter', quantity: '5', unit: 'g' },
      ],
    });
    await post('/orders', {
      requestId: crypto.randomUUID(),
      when: { type: 'now' },
      items: [
        { recipeId: omelette.id, servings: 1 },
        { recipeId: friedRice.id, servings: 1 },
      ],
    });

    // Ben buys only the omelette's eggs.
    await member.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
    await member.getByRole('button', { name: 'By day' }).click();
    await member.getByRole('checkbox', { name: 'Bought Egg for Omelette: 2 whole' }).check();
    await expect(
      member.getByRole('checkbox', { name: 'Not bought yet: Egg for Omelette' }),
    ).toBeChecked();
    await expect(
      member.getByRole('list', { name: 'Ingredients for Omelette' }).getByRole('listitem').first(),
    ).toContainText(`Bought by ${memberName}`);
    await expect(
      member.getByRole('checkbox', { name: 'Bought Egg for Fried rice: 1 whole' }),
    ).not.toBeChecked();

    // Ana's combined list keeps only the fried rice's egg to buy.
    await page.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
    const egg = openList(page).getByRole('listitem').filter({ hasText: 'Egg' });
    await expect(egg).toContainText('1 whole');
    await expect(egg).toContainText('Already bought 2 whole; this is the rest.');

    // A combined check covers both dishes; unchecking one dish warns that both reopen.
    await page.getByRole('checkbox', { name: 'Bought Butter: 15 g' }).check();
    await expect(page.getByRole('checkbox', { name: 'Not bought yet: Butter' })).toBeChecked();
    await page.getByRole('button', { name: 'By day' }).click();
    const friedButter = page.getByRole('checkbox', {
      name: 'Not bought yet: Butter for Fried rice',
    });
    await expect(friedButter).toBeChecked();
    page.once('dialog', (dialog) => dialog.dismiss());
    await friedButter.click();
    await expect(friedButter).toBeChecked();
    page.once('dialog', (dialog) => dialog.accept());
    await friedButter.click();
    await expect(
      page.getByRole('checkbox', { name: 'Bought Butter for Omelette: 10 g' }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: 'Bought Butter for Fried rice: 5 g' }),
    ).not.toBeChecked();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.getByRole('button', { name: '简体中文' }).click();
    await page.getByRole('checkbox', { name: '已买 Egg（Fried rice）：1 个' }).check();
    await expect(
      page.getByRole('checkbox', { name: '标记为未买：Egg（Fried rice）' }),
    ).toBeChecked();
  } finally {
    await memberContext.close();
  }
});
