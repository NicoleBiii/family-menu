import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test('the photo chooser handles an unavailable library and keeps manual upload usable in both languages', async ({
  page,
}) => {
  await page.goto('/household');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await page
    .getByRole('textbox', { name: 'Test account name' })
    .fill(`Photo library ${Date.now()}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Household name' }).fill(`Library home ${Date.now()}`);
  await page.getByRole('button', { name: 'Create household' }).click();
  await page.getByRole('link', { name: 'Family Menu home' }).click();
  await page.getByRole('button', { name: 'Manage recipes & menu' }).click();
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await page.getByRole('textbox', { name: 'Recipe name' }).fill('Library soup');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'View Library soup' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Search free photos' }).click();
  await dialog.getByRole('textbox', { name: 'Photo search' }).fill('vegetable soup');
  await dialog.getByRole('button', { name: 'Search photos' }).click();
  await expect(dialog.getByRole('alert')).toContainText('library is unavailable');
  await expect(dialog.getByText('Photos provided by Pexels')).toBeVisible();

  const file = await sharp({
    create: { width: 80, height: 60, channels: 3, background: '#aacc55' },
  })
    .jpeg()
    .toBuffer();
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'soup.jpg', mimeType: 'image/jpeg', buffer: file });
  await expect(dialog.getByRole('img', { name: 'Photo of Library soup' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Search free photos' }).click();
  await expect(page.getByRole('textbox', { name: 'Photo search' })).toBeVisible();
  await page.getByRole('button', { name: '简体中文' }).click();
  await expect(page.getByRole('textbox', { name: '搜索照片' })).toBeVisible();
  await expect(page.getByText('照片由 Pexels 提供')).toBeVisible();
});
