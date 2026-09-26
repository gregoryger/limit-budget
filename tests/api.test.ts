import { readFileSync } from 'node:fs';
import request from 'supertest';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { app } from '../server/app';
import type { ImportResult, SourceRow } from '../shared/transactions';
import { demoResponse } from '../server/gigachat/demo-response';
import { bankTablePdfFixture, multipagePdfFixture } from './helpers';
function decisions(review: ImportResult) {
  return review.rows.map((r) => ({
    sourceId: r.source.id,
    include: !!r.transaction,
    transaction: r.transaction,
    reviewed: false,
    reason: r.transaction ? '' : 'Неизвестно направление, исключаю',
  }));
}
beforeEach(() => vi.stubEnv('GIGACHAT_AUTH_KEY', ''));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('HTTP import to calculated budget', () => {
  it('anonymizes a bank table locally without invoking GigaChat', async () => {
    vi.stubEnv('GIGACHAT_AUTH_KEY', 'test-only-placeholder');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { body } = await request(app)
      .post('/api/anonymize')
      .attach('file', bankTablePdfFixture(), 'statement.pdf')
      .expect(200);
    expect(body.operations).toBe(2);
    expect(body.csv).not.toMatch(/12345678901234567890|ALICE|BOB/);
    expect(body.filename).toBe('budget-anonymized.csv');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uploads an actual CSV file, requires review, confirms and returns a verifiable budget', async () => {
    const imported = await request(app)
      .post('/api/import')
      .field('safeData', 'true')
      .attach('file', 'public/demo-statement.csv')
      .expect(200);
    const review = imported.body as ImportResult;
    expect(review.mode).toBe('demo');
    expect(review.rows).toHaveLength(13);
    const assumptions = {
      asOf: '2026-09-25',
      endDate: '2026-09-30',
      currentBalanceKopecks: 2140000,
      futurePaymentsKopecks: 890000,
      futureIncomeKopecks: 0,
      dailySpendKopecks: 60000,
    };
    await request(app).post('/api/budget').send({ importId: review.id, assumptions }).expect(400);
    const confirmed = await request(app)
      .post(`/api/import/${review.id}/confirm`)
      .send({ decisions: decisions(review) })
      .expect(200);
    expect(confirmed.body.transactions).toHaveLength(12);
    expect(confirmed.body.audit).toHaveLength(13);
    const result = await request(app)
      .post('/api/budget')
      .send({ importId: review.id, assumptions })
      .expect(200);
    expect(result.body.budget.projected).toBe(950000);
    expect(result.body.explanationMode).toBe('local');
    await request(app).delete(`/api/import/${review.id}`).expect(204);
    await request(app).post('/api/budget').send({ importId: review.id, assumptions }).expect(404);
  });
  it('requires a decision for omitted lines and an audit note for corrections', async () => {
    const { body: review } = await request(app)
      .post('/api/import')
      .field('safeData', 'true')
      .field('demo', 'true')
      .expect(200);
    const ds = decisions(review);
    await request(app)
      .post(`/api/import/${review.id}/confirm`)
      .send({ decisions: ds.slice(0, -1) })
      .expect(400);
    ds[0].transaction!.amountKopecks = 500000;
    await request(app).post(`/api/import/${review.id}/confirm`).send({ decisions: ds }).expect(400);
    ds[0].reviewed = true;
    ds[0].reason = 'Исправлено вручную при проверке';
    const result = await request(app)
      .post(`/api/import/${review.id}/confirm`)
      .send({ decisions: ds })
      .expect(200);
    expect(result.body.audit[0].action).toBe('corrected');
    expect(result.body.audit[0].source.amountKopecks).toBe(600000);
  });
  it('never applies the fixture response to an unrelated uploaded file', async () => {
    const file = readFileSync('public/demo-statement.csv', 'utf8').replace('+6000.00', '+9999.00');
    const result = await request(app)
      .post('/api/import')
      .field('safeData', 'true')
      .attach('file', Buffer.from(file), 'custom.csv')
      .expect(503);
    expect(result.body.error).toContain('Ключ GigaChat');
  });
  it('requires the safe-data acknowledgement and rejects cross-origin requests', async () => {
    await request(app).post('/api/import').field('demo', 'true').expect(400);
    await request(app).get('/api/health').set('Origin', 'https://untrusted.example').expect(403);
  });
  it('returns clear format and size errors', async () => {
    const response = await request(app)
      .post('/api/import')
      .field('safeData', 'true')
      .attach('file', Buffer.from('fake pdf'), 'bad.pdf')
      .expect(400);
    expect(response.body.error).toContain('PDF');
    const big = await request(app)
      .post('/api/import')
      .field('safeData', 'true')
      .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1), 'big.csv')
      .expect(413);
    expect(big.body.error).toContain('2 МБ');
  });
  it('runs the live-adapter route with mocked provider transport, then explains only calculated data', async () => {
    vi.stubEnv('GIGACHAT_AUTH_KEY', 'test-only-placeholder');
    const fetchMock = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
      if (url.includes('/oauth'))
        return Response.json({ access_token: 'test-token', expires_at: Date.now() + 1800000 });
      const payload = JSON.parse(options.body as string);
      return Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: payload.response_format
                ? JSON.stringify(demoResponse)
                : 'Объяснение тестового провайдера по рассчитанным данным.',
            },
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { body: review } = await request(app)
      .post('/api/import')
      .field('safeData', 'true')
      .attach('file', 'public/demo-statement.csv')
      .expect(200);
    expect(review.mode).toBe('gigachat');
    await request(app)
      .post(`/api/import/${review.id}/confirm`)
      .send({ decisions: decisions(review) })
      .expect(200);
    const assumptions = {
      asOf: '2026-09-25',
      endDate: '2026-09-30',
      currentBalanceKopecks: 2140000,
      futurePaymentsKopecks: 890000,
      futureIncomeKopecks: 0,
      dailySpendKopecks: 60000,
    };
    const { body } = await request(app)
      .post('/api/budget')
      .send({ importId: review.id, assumptions })
      .expect(200);
    expect(body.explanationMode).toBe('gigachat');
    expect(body.budget.projected).toBe(950000);
    const lastBody = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
    expect(JSON.parse(lastBody.messages[1].content).projected).toBe(950000);
  });
  it('marks the fallback explicitly when provider transport fails for the fixture', async () => {
    vi.stubEnv('GIGACHAT_AUTH_KEY', 'test-only-placeholder');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unavailable')));
    const { body } = await request(app)
      .post('/api/import')
      .field('safeData', 'true')
      .attach('file', 'public/demo-statement.csv')
      .expect(200);
    expect(body.mode).toBe('demo');
    expect(body.notice).toContain('недоступен');
  });
  it('does not substitute demo data for a custom file on provider outage', async () => {
    vi.stubEnv('GIGACHAT_AUTH_KEY', 'test-only-placeholder');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unavailable')));
    const file = readFileSync('public/demo-statement.csv', 'utf8').replace('+6000.00', '+9999.00');
    const { body } = await request(app)
      .post('/api/import')
      .field('safeData', 'true')
      .attach('file', Buffer.from(file), 'custom.csv')
      .expect(502);
    expect(body.error).toContain('не импортирован');
    expect(body.rows).toBeUndefined();
  });
  it('imports and confirms a PDF beyond the former file, page, row and JSON limits', async () => {
    vi.stubEnv('GIGACHAT_AUTH_KEY', 'test-only-placeholder');
    const fetchMock = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
      if (url.includes('/oauth'))
        return Response.json({ access_token: 'test-token', expires_at: Date.now() + 1800000 });
      const payload = JSON.parse(options.body as string);
      const rows = JSON.parse(payload.messages[1].content) as SourceRow[];
      return Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                transactions: rows.map((row) => ({
                  sourceId: row.id,
                  date: row.date,
                  description: row.description,
                  amountKopecks: row.amountKopecks,
                  direction: row.direction,
                  category: 'Другое',
                  recurring: false,
                  suspicious: false,
                  note: '',
                })),
                skipped: [],
              }),
            },
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const pdf = multipagePdfFixture();
    const { body: review } = await request(app)
      .post('/api/import')
      .field('safeData', 'true')
      .attach('file', pdf, 'long.pdf')
      .expect(200);
    expect(review.mode).toBe('gigachat');
    expect(review.rows).toHaveLength(525);
    const ds = decisions(review);
    ds.forEach((d) => (d.reason = 'п'.repeat(500)));
    expect(Buffer.byteLength(JSON.stringify({ decisions: ds }))).toBeGreaterThan(300 * 1024);
    const { body: confirmed } = await request(app)
      .post(`/api/import/${review.id}/confirm`)
      .send({ decisions: ds })
      .expect(200);
    expect(confirmed.transactions).toHaveLength(525);
    expect(
      fetchMock.mock.calls.filter((c) => c[0].includes('/chat/completions')).length,
    ).toBeGreaterThan(1);
  }, 30000);
});
