import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractStatement } from '../server/statement-import/parser';
import { maskNumbers } from '../server/statement-import/bank-table';
import { validateModelResponse } from '../server/transactions/validate';
import { bankTablePdfFixture } from './helpers';

describe('bank table PDF import', () => {
  it('keeps only operations and drops header identifiers instead of rejecting the file', async () => {
    const rows = await extractStatement(bankTablePdfFixture(), 'bank.pdf', 'application/pdf');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.raw).join('\n')).not.toContain('12345678901234567890');
    expect(rows[0]).toMatchObject({
      date: '2026-09-03',
      description: 'PRIVATE MERCHANT ALICE',
      amountKopecks: 125050,
      direction: 'expense',
      origin: 'bank-table',
    });
    expect(rows[1]).toMatchObject({ direction: 'income', amountKopecks: 600000 });
  });

  it('masks card, account, contract and phone numbers down to the last four digits', () => {
    expect(maskNumbers('Перевод по номеру +79991234567 на договор 5123456789, чек 1234')).toBe(
      'Перевод по номеру •••• 4567 на договор •••• 6789, чек 1234',
    );
  });
});

describe('GigaChat categorization of pre-parsed bank rows', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GIGACHAT_AUTH_KEY', 'test-only-placeholder');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('asks only for categories of unique descriptions and keeps verified values', async () => {
    const rows = [
      ...(await extractStatement(bankTablePdfFixture(), 'bank.pdf', 'application/pdf')),
      {
        id: 'row-3',
        raw: '05.09.2026 PRIVATE MERCHANT ALICE -10.00',
        date: '2026-09-05',
        description: 'PRIVATE MERCHANT ALICE',
        amountKopecks: 1000,
        direction: 'expense' as const,
        origin: 'bank-table' as const,
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ access_token: 'test-token', expires_at: Date.now() + 1800000 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  items: [
                    { k: 0, category: 'Кафе', recurring: false },
                    { k: 1, category: 'Переводы', recurring: false },
                  ],
                }),
              },
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { extractWithGigaChat } = await import('../server/gigachat/adapter');
    const result = await extractWithGigaChat(rows);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(JSON.parse(request.messages[1].content)).toHaveLength(2);
    expect(request.response_format.schema.required).toEqual(['items']);
    const review = validateModelResponse(result, rows);
    expect(review.every((r) => r.transaction && !r.issues.length)).toBe(true);
    expect(review.map((r) => r.transaction?.category)).toEqual(['Кафе', 'Переводы', 'Кафе']);
  });
});
