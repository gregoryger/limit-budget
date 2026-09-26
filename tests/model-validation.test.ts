import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseCsv } from '../server/statement-import/parser';
import { validateModelResponse } from '../server/transactions/validate';
import { demoResponse } from '../server/gigachat/demo-response';
const rows = parseCsv(readFileSync('public/demo-statement.csv', 'utf8'));
describe('model response validation', () => {
  it('accepts the authored demo only with source provenance', () => {
    const result = validateModelResponse(demoResponse, rows);
    expect(result.filter((r) => r.transaction)).toHaveLength(12);
    expect(result[12].issues[0]).toContain('направление');
  });
  it('rejects prose, missing fields, fractions and unknown categories', () => {
    expect(() => validateModelResponse('Ваши расходы 100 рублей', rows)).toThrow();
    for (const patch of [
      { amountKopecks: 1.5 },
      { category: 'HALLUCINATION' },
      { date: '2026-02-30' },
    ]) {
      expect(() =>
        validateModelResponse(
          { ...demoResponse, transactions: [{ ...demoResponse.transactions[0], ...patch }] },
          rows,
        ),
      ).toThrow();
    }
  });
  it('rejects invented or duplicate source IDs', () => {
    expect(() =>
      validateModelResponse(
        {
          ...demoResponse,
          transactions: [{ ...demoResponse.transactions[0], sourceId: 'invented' }],
        },
        rows,
      ),
    ).toThrow('неизвестную');
    expect(() =>
      validateModelResponse(
        {
          ...demoResponse,
          transactions: [demoResponse.transactions[0], demoResponse.transactions[0]],
        },
        rows,
      ),
    ).toThrow('повторила');
  });
  it('quarantines wrong amounts, dates, descriptions and direction', () => {
    for (const patch of [
      { amountKopecks: 999 },
      { date: '2026-09-02' },
      { description: 'Invented' },
      { direction: 'expense' },
    ]) {
      const result = validateModelResponse(
        { ...demoResponse, transactions: [{ ...demoResponse.transactions[0], ...patch }] },
        rows,
      );
      expect(result[0].transaction).toBeNull();
      expect(result[0].issues.length).toBeGreaterThan(0);
    }
  });
  it('does not silently discard omitted or ambiguous rows', () => {
    const result = validateModelResponse({ transactions: [], skipped: [] }, rows);
    expect(result).toHaveLength(13);
    expect(result.every((r) => r.transaction === null && r.issues.length)).toBe(true);
    const ambiguous = {
      ...demoResponse.transactions[0],
      sourceId: 'row-13',
      date: '2026-09-25',
      description: 'Возврат или покупка',
      amountKopecks: 45000,
    };
    expect(
      validateModelResponse({ transactions: [ambiguous], skipped: [] }, rows)[12].transaction,
    ).toBeNull();
  });
});
