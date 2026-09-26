import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { ok: true, gigachatConfigured: false } }),
  );
});

test('budget story explains actual amounts, pauses, finishes and respects reduced motion', async ({
  page,
}) => {
  await page.goto('/');
  const story = page.locator('.budget-story');
  await expect(story.locator('figcaption')).toContainText('24 303');
  await page.getByRole('button', { name: 'Показать разбор бюджета' }).click();
  await page.getByRole('button', { name: 'Приостановить разбор бюджета' }).click();
  await expect(page.getByRole('button', { name: 'Показать разбор бюджета' })).toBeVisible();
  await page.getByRole('button', { name: 'Показать разбор бюджета' }).click();
  await expect(page.getByRole('button', { name: 'Показать разбор бюджета' })).toBeVisible({
    timeout: 10000,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Показать разбор бюджета' })).toHaveCount(0);
  await expect(story).toContainText('Остаток − обязательные платежи = свободные деньги');
  await expect(story.locator('figcaption')).toContainText('24 303');
});

test('upload keeps keyboard focus inside and Escape restores the trigger', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Загрузить выписку', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Закрыть загрузку' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Попробовать демо', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Закрыть загрузку' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('mobile navigation stays reachable after scrolling and changing screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.page-footer').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Переводы', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Переводы', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
