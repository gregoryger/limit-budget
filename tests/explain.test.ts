import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateBudget } from '../shared/budget-calculation';
import { createShowcaseData } from '../shared/showcase';

const answer = (content: string) =>
  Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] });

describe('GigaChat budget explanation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GIGACHAT_AUTH_KEY', 'test-only-placeholder');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const budget = () => {
    const demo = createShowcaseData();
    return calculateBudget(demo.transactions, demo.assumptions);
  };

  it('sends amounts in roubles and separates statement history from the forecast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: 't', expires_at: Date.now() + 1800000 }))
      .mockResolvedValueOnce(answer('К концу периода останется 56 803 ₽.'));
    vi.stubGlobal('fetch', fetchMock);
    const { explainBudget } = await import('../server/gigachat/adapter');
    const b = budget();
    await expect(explainBudget(b)).resolves.toContain('₽');
    const facts = JSON.parse(JSON.parse(fetchMock.mock.calls[1][1].body).messages[1].content);
    expect(facts.forecast.leftAtEnd).toContain('₽');
    expect(facts.statementHistory.expenses).toContain('₽');
    expect(JSON.stringify(facts)).not.toContain(String(b.projected));
  });

  it('rejects an explanation written in kopecks so the local text is shown instead', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ access_token: 't', expires_at: Date.now() + 1800000 }),
        )
        .mockResolvedValueOnce(answer('Остаток составит 4847800 копеек.')),
    );
    const { explainBudget } = await import('../server/gigachat/adapter');
    await expect(explainBudget(budget())).rejects.toThrow('kopecks');
  });
});
