import { expect, test } from '@playwright/test';
import { calculateScenarioImpact, type ScenarioIntent } from '../../shared/scenario-ai';
import { createShowcaseData } from '../../shared/showcase';

test('jury can explore all showcase features immediately', async ({ page }) => {
  await page.route('**/api/scenario-ai', (route) => {
    const { question } = route.request().postDataJSON() as { question: string };
    const rent = question.includes('квартиру');
    const win = question.includes('казино');
    const intent: ScenarioIntent = {
      event: win ? 'income' : 'expense',
      frequency: rent ? 'monthly' : 'once',
      amountKopecks: win ? 50_000_000 : rent ? 2_500_000 : 5_000_000,
      label: win ? 'Условный выигрыш' : rent ? 'Аренда квартиры' : 'Покупка телефона',
      uncertain: win,
      clarification: '',
    };
    const demo = createShowcaseData(new Date(2026, 8, 26));
    return route.fulfill({
      json: {
        mode: 'gigachat',
        intent,
        impact: calculateScenarioImpact(demo.transactions, demo.assumptions, intent),
        explanation: {
          summary: win
            ? 'Если выигрыш случится, прогноз вырастет. Выигрыш не гарантирован.'
            : rent
              ? 'Аренда снизит прогноз на 25 000 ₽.'
              : 'Покупка снизит прогноз на 50 000 ₽.',
          keyPoints: ['Это условный расчёт.', 'Учитывайте обязательные платежи.'],
          nextStep: 'Сравните с базовым планом.',
          followUp: 'Что проверить ещё?',
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.getByText('ИНТЕРАКТИВНОЕ ДЕМО · ВЫМЫШЛЕННЫЕ ДАННЫЕ')).toBeVisible();
  await expect(page.locator('.showcase-free')).toContainText('24 303');
  await page.getByRole('button', { name: 'Сценарии', exact: true }).click();
  await page.getByRole('button', { name: 'Куплю телефон за 50 000 ₽' }).click();
  await expect(page.locator('.scenario-ai-answer')).toContainText('Покупка снизит прогноз');
  await expect(page.locator('.large-number')).toContainText('6 803');
  await page.getByRole('button', { name: 'Сниму квартиру за 25 000 ₽ в месяц' }).click();
  await expect(page.locator('.question-feedback')).toContainText('каждый месяц');
  await expect(page.locator('.large-number')).toContainText('31 803');
  await page.screenshot({ path: 'test-results/showcase-scenarios.png', fullPage: true });
  await page.getByRole('button', { name: 'Что будет, если выиграю в казино 500 000 ₽?' }).click();
  await expect(page.locator('.question-feedback')).toContainText('поступление');
  await expect(page.locator('.large-number')).toContainText('556 803');
  await expect(page.locator('.scenario-ai-facts')).toContainText('56 803');
  await page.screenshot({ path: 'test-results/showcase-win-scenario.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/showcase-win-phone.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: 'Детектив', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Куда уходят деньги?' })).toBeVisible();
  await expect(page.locator('.insight-card').nth(1)).toContainText('5 260');
  await page.screenshot({ path: 'test-results/showcase-detective.png', fullPage: true });

  await page.getByRole('button', { name: 'Цели', exact: true }).click();
  await expect(page.locator('.goal-result')).toContainText('8 мес.');
  await page.getByLabel('Откладывать в месяц, ₽').fill('20000');
  await expect(page.locator('.goal-result')).toContainText('5 мес.');
  await page.screenshot({ path: 'test-results/showcase-goals.png', fullPage: true });

  await page.getByRole('button', { name: 'Подписки', exact: true }).click();
  await expect(page.locator('.subscription-summary')).toContainText('12 564');
  await page.locator('.subscription-row').first().getByRole('checkbox').check();
  await expect(page.locator('.subscription-summary .accent')).toContainText('4 188');
  await page.screenshot({ path: 'test-results/showcase-subscriptions.png', fullPage: true });
});

test('showcase remains usable at narrow phone width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  for (const section of [
    'Обзор',
    'Сценарии',
    'Детектив',
    'Цели',
    'Подписки',
    'Карты и счета',
    'Переводы',
  ]) {
    await page.getByRole('button', { name: section, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  await page.screenshot({ path: 'test-results/showcase-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'GigaChat помощник' }).click();
  await expect(page.getByRole('dialog', { name: 'Помощник GigaChat' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/gigachat-phone.png', fullPage: true });
});

test('GigaChat companion exposes its connection state without pretending to answer', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'GigaChat помощник' }).click();
  const dialog = page.getByRole('dialog', { name: 'Помощник GigaChat' });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: 'test-results/gigachat-panel.png', fullPage: true });
  const health = (await (await page.request.get('/api/health')).json()) as {
    gigachatConfigured: boolean;
  };
  if (!health.gigachatConfigured) {
    await expect(dialog).toContainText('Подключите GigaChat');
    await expect(dialog.getByLabel('Вопрос GigaChat')).toHaveCount(0);
  }
});

test('GigaChat companion receives the current screen and goal for follow-up advice', async ({
  page,
}) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { ok: true, gigachatConfigured: true } }),
  );
  await page.route('**/api/advisor', (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        mode: 'gigachat',
        message: 'Это ответ модели по текущим расчётам.',
        nextStep: 'Сравните варианты.',
        followUp: 'Что проверим дальше?',
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'GigaChat помощник' }).click();
  await expect(page.getByRole('dialog', { name: 'Помощник GigaChat' })).toContainText(
    'Это ответ модели',
  );
  await page.getByRole('button', { name: 'Закрыть помощника' }).click();
  await page.getByRole('button', { name: 'Цели', exact: true }).click();
  await page.getByLabel('Откладывать в месяц, ₽').fill('20000');
  await page.getByRole('button', { name: 'Обсудить с GigaChat' }).click();
  await expect
    .poll(() =>
      requests.some(
        (item) =>
          (item.goal as { monthlyKopecks?: number } | undefined)?.monthlyKopecks === 2_000_000,
      ),
    )
    .toBe(true);
  await page.getByLabel('Вопрос GigaChat').fill('Что если буду откладывать больше?');
  await page.getByRole('button', { name: 'Отправить вопрос' }).click();
  await expect
    .poll(() => requests.some((item) => item.question === 'Что если буду откладывать больше?'))
    .toBe(true);
  const followUp = requests.find((item) => item.question === 'Что если буду откладывать больше?');
  expect(followUp?.history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: 'assistant',
        content: 'Это ответ модели по текущим расчётам.',
      }),
    ]),
  );
});
