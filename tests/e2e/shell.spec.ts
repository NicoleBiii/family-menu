import { expect, test } from '@playwright/test';

test('starter recipes can be searched, inspected and closed with focus restored', async ({
  page,
}) => {
  await page.goto('/recipes');
  const cards = page.getByRole('button', { name: /^View / });
  await expect(cards).toHaveCount(12);
  await page.getByRole('textbox', { name: 'Search recipes' }).fill('sesame');
  const recipe = page.getByRole('button', { name: 'View Sesame noodle bowl' });
  await expect(cards).toHaveCount(1);
  await recipe.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('200 g wheat noodles, dried');
  await expect(page.getByRole('dialog')).toContainText('chili oil (optional, to taste)');
  await expect(page.getByRole('link', { name: 'Sign in to save recipes' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(recipe).toBeFocused();
  await page.getByRole('textbox', { name: 'Search recipes' }).fill('nothing matches');
  await expect(page.getByRole('heading', { name: 'No starter recipes found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(cards).toHaveCount(12);
});

test('shopping explains sign-in when signed out and the layout fits the viewport', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
  await expect(page.getByRole('heading', { name: 'Shopping', exact: true })).toBeVisible();
  await expect(
    page.getByText('Sign in to see what your household needs to buy for its planned meals.'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/shopping$/);
  // Home sits outside the bottom tabs; signed-out visitors still reach the starter recipes.
  await page.getByRole('link', { name: 'Family Menu home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Your household menu' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();
  await page.getByRole('button', { name: 'Manage recipes & menu' }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole('heading', { name: 'Starter recipes' })).toBeVisible();
  // Recipe management belongs to the Menu tab and has its own way back.
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(nav.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-current', 'page');
  // Opened directly, Back still leads to ordering instead of leaving the app.
  await page.goto('/recipes');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Your household menu' })).toBeInViewport();
  // The Menu tab returns to the dishes from any tab.
  await nav.getByRole('button', { name: 'Shopping' }).click();
  await nav.getByRole('button', { name: 'Menu' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Your household menu' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('the bottom navigation keeps Chinese labels on one line when zoomed', async ({ page }) => {
  // 200% zoom on a laptop leaves a viewport just above the phone layout. Wider fonts than the
  // test browser's must not squeeze the bar into one character per line.
  await page.setViewportSize({ width: 701, height: 500 });
  await page.goto('/meals');
  await page.getByRole('button', { name: '简体中文' }).click();
  await page.addStyleTag({ content: '.main-nav button { letter-spacing: 6px; }' });
  const nav = page.getByRole('navigation', { name: '主导航' });
  for (const name of ['订单', '购物清单', '家庭']) {
    const label = nav.getByRole('button', { name }).locator('span');
    const box = await label.boundingBox();
    expect(box!.height, `${name} stays on one line`).toBeLessThan(25);
  }
  const bar = await nav.boundingBox();
  expect(Math.abs(bar!.x - (701 - bar!.x - bar!.width))).toBeLessThan(2);
});

test('API errors stay JSON instead of returning the application shell', async ({ request }) => {
  const response = await request.get('/api/missing', { headers: { Accept: 'text/html' } });
  expect(response.status()).toBe(404);
  expect(response.headers()['content-type']).toContain('application/json');
});
