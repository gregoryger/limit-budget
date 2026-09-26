import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../server/app';
import { advisorFacts } from '../server/gigachat/advisor';
import { createShowcaseData } from '../shared/showcase';
import { calculateScenarioImpact } from '../shared/scenario-ai';

const demo = createShowcaseData(new Date(2026, 8, 26));
const payload = { screen: 'Обзор', assumptions: demo.assumptions };

beforeEach(() => {
  vi.stubEnv('GIGACHAT_AUTH_KEY', 'test-only-placeholder');
  vi.stubEnv('GIGACHAT_BASE_URL', 'https://api.giga.chat/v1');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GigaChat advisor', () => {
  it('sends only verified calculations and returns a real model response', async () => {
    const answer = {
      message: 'После обязательных платежей часть остатка доступна для повседневных решений.',
      nextStep: 'Сравните крупную покупку в симуляторе.',
      followUp: 'Какую покупку хотите проверить?',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ access_token: 'test-token', expires_at: Date.now() + 1800000 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const response = await request(app).post('/api/advisor').send(payload);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...answer, mode: 'gigachat' });
    const call = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(call.response_format.type).toBe('json_schema');
    expect(call.response_format.schema.required).toEqual(['message', 'nextStep', 'followUp']);
    expect(call.messages[1].content).toMatch(/24\s303/);
    expect(call.messages[1].content).not.toContain('demo-35');
  });

  it('uses calculated scenario and subscription context instead of client supplied transactions', () => {
    const scenario = advisorFacts(
      {
        ...payload,
        screen: 'Сценарии',
        history: [],
        scenario: { amountKopecks: 5_000_000, dailySpendKopecks: 65_000, recurring: false },
      },
      demo.transactions,
      true,
    );
    expect(JSON.stringify(scenario)).toMatch(/6\s803/);
    const subscriptions = advisorFacts(
      { ...payload, screen: 'Подписки', history: [], pausedSubscriptionIds: ['demo-19'] },
      demo.transactions,
      true,
    );
    expect(JSON.stringify(subscriptions)).toMatch(/12\s564/);
  });

  it('understands a hypothetical casino win as uncertain income and calculates both outcomes', async () => {
    const intent = {
      event: 'income',
      frequency: 'once',
      amountKopecks: 50_000_000,
      label: 'Условный выигрыш в казино',
      uncertain: true,
      clarification: '',
    };
    const explanation = {
      summary: 'Если выигрыш случится, остаток увеличится. Без выигрыша действует базовый прогноз.',
      keyPoints: ['Выигрыш не гарантирован.', 'Не планируйте обязательные траты под него.'],
      nextStep: 'Проверьте план без выигрыша.',
      followUp: 'Хотите сравнить другой сценарий?',
    };
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.includes('/oauth'))
          return Response.json({ access_token: 'test-token', expires_at: Date.now() + 1800000 });
        const body = JSON.parse(String(options.body));
        calls.push(body);
        const content = calls.length === 1 ? intent : explanation;
        return Response.json({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
        });
      }),
    );
    const response = await request(app).post('/api/scenario-ai').send({
      question: 'Что будет, если выиграю в казино 500000 рублей?',
      assumptions: demo.assumptions,
    });
    expect(response.status).toBe(200);
    expect(response.body.intent).toEqual(intent);
    expect(response.body.impact.baseProjectedKopecks).toBe(5_680_300);
    expect(response.body.impact.scenarioProjectedKopecks).toBe(55_680_300);
    expect(response.body.explanation).toEqual(explanation);
    expect(calls).toHaveLength(2);
    const facts = JSON.parse((calls[1].messages as { content: string }[])[1].content);
    expect(facts.calculations.baseProjected).toMatch(/56\s803/);
    expect(facts.calculations.conditionalProjected).toMatch(/556\s803/);
  });

  it('does not invent a forecast when the question has no amount', async () => {
    const intent = {
      event: 'expense',
      frequency: 'once',
      amountKopecks: null,
      label: 'Покупка телефона',
      uncertain: false,
      clarification: 'Сколько стоит телефон?',
    };
    let modelCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/oauth'))
          return Response.json({ access_token: 'test-token', expires_at: Date.now() + 1800000 });
        modelCalls++;
        return Response.json({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(intent) } }],
        });
      }),
    );
    const response = await request(app).post('/api/scenario-ai').send({
      question: 'Что будет, если куплю телефон?',
      assumptions: demo.assumptions,
    });
    expect(response.status).toBe(200);
    expect(response.body.impact).toBeNull();
    expect(response.body.explanation).toBeNull();
    expect(modelCalls).toBe(1);
  });

  it('counts a recurring expense within the selected forecast period', () => {
    const impact = calculateScenarioImpact(demo.transactions, demo.assumptions, {
      event: 'expense',
      frequency: 'monthly',
      amountKopecks: 2_500_000,
      label: 'Аренда квартиры',
      uncertain: false,
      clarification: '',
    });
    expect(impact?.occurrences).toBe(1);
    expect(impact?.scenarioProjectedKopecks).toBe(3_180_300);
    expect(impact?.yearlyAmountKopecks).toBe(30_000_000);
  });

  it('shows clear setup status when no server key is configured', async () => {
    vi.stubEnv('GIGACHAT_AUTH_KEY', '');
    const health = await request(app).get('/api/health');
    expect(health.body.gigachatConfigured).toBe(false);
    const response = await request(app).post('/api/advisor').send(payload);
    expect(response.status).toBe(503);
    expect(response.body.error).toContain('GigaChat');
  });
});
