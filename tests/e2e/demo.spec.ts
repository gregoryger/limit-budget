import { expect, test } from '@playwright/test';
test('actual file → review → audited import → forecast → transfer simulation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Деньги под контролем.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/01-overview-empty.png', fullPage: true });
  await page.getByRole('button', { name: 'Загрузить выписку', exact: true }).click();
  await page.getByLabel('Файл выписки').setInputFiles('public/demo-statement.csv');
  await page.getByLabel('Файл синтетический или обезличен').check();
  await page.getByRole('button', { name: 'Загрузить и распознать' }).click();
  await expect(page.getByRole('heading', { name: 'Всё ли верно?' })).toBeVisible();
  await page.getByRole('button', { name: 'Подтвердить импорт' }).click();
  await expect(page.getByRole('alert')).toContainText('причину исключения');
  await page
    .getByLabel('Причина строки 13', { exact: true })
    .fill('Направление неизвестно, исключаю');
  await page.screenshot({ path: 'test-results/02-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Подтвердить импорт' }).click();
  await expect(page.getByText('Давай уточним пару вещей')).toBeVisible();
  await page.getByLabel('Текущий остаток').fill('21400');
  await page.getByLabel('Обязательные платежи').fill('8900');
  await page.getByRole('button', { name: 'Рассчитать прогноз' }).click();
  await expect(page.getByText('Да, по твоему плану хватит')).toBeVisible();
  await expect(page.locator('.forecast-card')).toContainText('9 500');
  await page.screenshot({ path: 'test-results/03-overview-result.png', fullPage: true });
  await page.getByRole('button', { name: 'Карты и счета', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Карты и счета' })).toBeVisible();
  await page.screenshot({ path: 'test-results/04-accounts.png', fullPage: true });
  await page.getByRole('button', { name: 'Переводы', exact: true }).click();
  await page.getByLabel('Сумма перевода').fill('2000');
  await expect(page.locator('.large-number')).toContainText('7 500');
  await page.screenshot({ path: 'test-results/05-transfers.png', fullPage: true });
  await page.getByRole('button', { name: 'Сценарии', exact: true }).click();
  await page.getByLabel('Сценарий ежедневных трат').fill('3000');
  await expect(page.locator('.large-number')).toContainText('2 500');
  await expect(page.locator('.large-number')).toHaveClass(/negative/);
  await page.screenshot({ path: 'test-results/06-scenarios.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('mobile demo button and manual correction remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/07-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Попробовать демо', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Всё ли верно?' })).toBeVisible();
  await page.getByLabel('Сумма строки 1', { exact: true }).fill('6100');
  await page.getByLabel('Причина строки 1', { exact: true }).fill('Учебное исправление суммы');
  await page.locator('.review-row').first().getByLabel('Я проверил эту операцию').check();
  await page.getByLabel('Причина строки 13', { exact: true }).fill('Исключаю неизвестную операцию');
  await page.getByRole('button', { name: 'Подтвердить импорт' }).click();
  await expect(page.getByText('31 600')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
