import { expect, test, type Page } from '@playwright/test';

// Uses the test-only provider stub (tests/e2e/provider-stub.mjs) in place of Google/Supabase.
// Real provider behavior still needs a staging smoke test.

async function chooseAccount(page: Page, name: string) {
  await page.getByRole('textbox', { name: 'Test account name' }).fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
}

function unique(label: string) {
  return `${label} ${test.info().project.name} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

test('signed-out visitors see an honest sign-in prompt for households', async ({ page }) => {
  await page.goto('/household');
  await expect(
    page.getByRole('heading', { name: 'A place for your favourite people.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();
  expect((await page.request.get('/api/households')).status()).toBe(401);
});

test('an owner creates a household, invites a member who joins, then removes them', async ({
  browser,
  page,
}) => {
  const ownerName = unique('Owner');
  const memberName = unique('Member');
  const householdName = unique('家 Home');

  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await chooseAccount(page, ownerName);
  await expect(page).toHaveURL(/\/household$/);
  await page.getByRole('textbox', { name: 'Household name' }).fill(householdName);
  await page.getByRole('button', { name: 'Create household' }).click();
  await expect(page.getByRole('heading', { name: householdName })).toBeVisible();
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  const link = await page
    .getByRole('textbox', { name: 'New invitation link (shown once)' })
    .inputValue();
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4173\/join#[A-Za-z0-9_-]{40,}$/);
  await expect(page.getByRole('heading', { name: 'Active links (1)' })).toBeVisible();

  const memberContext = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
  });
  const member = await memberContext.newPage();
  await member.goto(link);
  await expect(member).toHaveURL(/\/join$/); // token removed from the address bar
  await member.getByRole('link', { name: 'Sign in with Google' }).click();
  await chooseAccount(member, memberName);
  await expect(member.getByRole('heading', { name: householdName })).toBeVisible();
  await member.getByRole('button', { name: 'Join household' }).click();
  await expect(member.getByText('You are a member')).toBeVisible();
  await expect(member.getByText(`${memberName} (you)`)).toBeVisible();
  expect(
    await member.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);

  // The used link cannot admit anyone else.
  const thirdContext = await browser.newContext();
  const third = await thirdContext.newPage();
  await third.goto(link);
  await third.getByRole('link', { name: 'Sign in with Google' }).click();
  await chooseAccount(third, unique('Third'));
  await expect(third.getByRole('alert')).toContainText('expired or is no longer valid');
  await thirdContext.close();

  await page.reload();
  await expect(page.getByText(memberName)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Active links (1)' })).toHaveCount(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `Remove ${memberName}` }).click();
  await expect(page.getByText(memberName)).toHaveCount(0);

  await member.reload();
  await expect(member.getByRole('heading', { name: 'Start your household' })).toBeVisible();
  await expect(member.getByText(householdName)).toHaveCount(0);

  await member.getByRole('button', { name: 'Sign out' }).click();
  await expect(member.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();
  await memberContext.close();
});

test('a cancelled sign-in explains what happened', async ({ page }) => {
  await page.goto('/?authError=provider_denied');
  await expect(page.getByRole('alert')).toHaveText(/Google sign-in was cancelled/);
  await expect(page).toHaveURL(/\/$/);
});
