import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { extractStatement, parseCsv, MAX_CSV_BYTES } from '../server/statement-import/parser';
import { parseMoney } from '../shared/transactions';
import { multipagePdfFixture, pdfFixture } from './helpers';
describe('statement-import', () => {
  it('reads the demo, preserves source and identifies ambiguity', async () => {
    const rows = await extractStatement(
      await readFile('public/demo-statement.csv'),
      'demo.csv',
      'text/csv',
    );
    expect(rows).toHaveLength(13);
    expect(rows[2].amountKopecks).toBe(125050);
    expect(rows[0].direction).toBe('income');
    expect(rows[12].direction).toBeNull();
    expect(rows[12].raw).toContain('unknown');
  });
  it('handles quoted CSV and decimal commas exactly', () => {
    const rows = parseCsv(
      'date,description,amount,direction\n2026-09-01,"Cafe, shop","-12,34",expense',
    );
    expect(rows[0]).toMatchObject({
      description: 'Cafe, shop',
      amountKopecks: 1234,
      direction: 'expense',
    });
    expect(parseMoney('1 250,50')).toBe(125050);
    expect(parseMoney('0.29')).toBe(29);
    expect(parseMoney('1.234')).toBeNull();
  });
  it('rejects empty statements and unsupported formats', async () => {
    await expect(extractStatement(Buffer.alloc(0), 'a.csv', 'text/csv')).rejects.toThrow('пустая');
    await expect(
      extractStatement(Buffer.from('date;description;amount;direction\n'), 'a.csv', 'text/csv'),
    ).rejects.toThrow('нет операций');
    await expect(
      extractStatement(Buffer.from('x'), 'a.exe', 'application/octet-stream'),
    ).rejects.toThrow('только CSV');
  });
  it('rejects oversize, binary masquerading as CSV, invalid UTF-8 and sensitive long numbers', async () => {
    await expect(
      extractStatement(Buffer.alloc(MAX_CSV_BYTES + 1), 'a.csv', 'text/csv'),
    ).rejects.toThrow('2 МБ');
    await expect(extractStatement(Buffer.from([0, 1]), 'a.csv', 'text/csv')).rejects.toThrow(
      'текстовый CSV',
    );
    await expect(extractStatement(Buffer.from([255]), 'a.csv', 'text/csv')).rejects.toThrow(
      'UTF-8',
    );
    await expect(
      extractStatement(
        Buffer.from(
          'date;description;amount;direction\n2026-09-01;1234 1234 1234 1234;-12;expense',
        ),
        'a.csv',
        'text/csv',
      ),
    ).rejects.toThrow('масками');
  });
  it('keeps invalid dates, malformed rows and conflicting signs visible', () => {
    const rows = parseCsv(
      'date;description;amount;direction\n2026-02-30;x;12;unknown\n2026-09-01;y;-12;income\nbroken',
    );
    expect(rows[0].date).toBeNull();
    expect(rows[0].direction).toBeNull();
    expect(rows[1].issue).toContain('противоречит');
    expect(rows[2].raw).toBe('broken');
  });
  it('extracts a real text PDF and verifies the signed amount', async () => {
    const rows = await extractStatement(pdfFixture(), 'synthetic.pdf', 'application/pdf');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-09-03',
      description: 'Store',
      amountKopecks: 125050,
      direction: 'expense',
    });
  });
  it('rejects PDFs without text and incorrect PDF signatures', async () => {
    await expect(extractStatement(pdfFixture(''), 'scan.pdf', 'application/pdf')).rejects.toThrow(
      'нет текстового слоя',
    );
    await expect(
      extractStatement(Buffer.from('not pdf'), 'scan.pdf', 'application/pdf'),
    ).rejects.toThrow('Неверный тип PDF');
  });
  it('keeps PDF headers and multi-amount lines visible for review', async () => {
    const rows = await extractStatement(
      pdfFixture('2026-09-03 Store 100.00 -1250.50'),
      'synthetic.pdf',
      'application/pdf',
    );
    // A second monetary value is not automatically trusted as a transaction description.
    expect(rows[0].raw).toContain('100.00');
    expect(rows[0].amountKopecks).toBeNull();
    expect(rows[0].issue).toContain('Неоднозначная');
  });
  it('extracts more than 20 pages, 200 operations and 2 MiB of text PDF', async () => {
    const pdf = multipagePdfFixture();
    expect(pdf.length).toBeGreaterThan(2 * 1024 * 1024);
    const rows = await extractStatement(pdf, 'long.pdf', 'application/pdf');
    expect(rows).toHaveLength(525);
    expect(rows[0].amountKopecks).toBe(1000);
    expect(rows.at(-1)?.description).toBe('Store-20-24');
  }, 30000);
});
