import { describe, expect, it } from 'vitest';
import { anonymizeBankTablePdf } from '../server/statement-import/anonymize-bank-table';
import { extractStatement, parseCsv } from '../server/statement-import/parser';
import { bankTablePdfFixture, pdfFixture } from './helpers';

describe('local PDF anonymization', () => {
  it('keeps dates and amounts while discarding account numbers, names and descriptions', async () => {
    const { csv, operations, ambiguous } = await anonymizeBankTablePdf(bankTablePdfFixture());
    expect(operations).toBe(2);
    expect(ambiguous).toBe(0);
    expect(csv).not.toMatch(/12345678901234567890|ALICE|BOB|PRIVATE|PERSONAL/);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: '2026-09-03',
      description: 'Расход',
      amountKopecks: 125050,
      direction: 'expense',
    });
    expect(rows[1]).toMatchObject({
      date: '2026-09-04',
      description: 'Поступление',
      amountKopecks: 600000,
      direction: 'income',
    });
    await expect(extractStatement(Buffer.from(csv), 'safe.csv', 'text/csv')).resolves.toHaveLength(2);
  });
  it('rejects PDFs without the supported table layout', async () => {
    await expect(anonymizeBankTablePdf(pdfFixture())).rejects.toThrow('Таблица операций');
  });
});
