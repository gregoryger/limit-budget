import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { dateSchema, parseMoney } from '../../shared/transactions.js';
import { InputError } from './parser.js';

export type PdfItem = { x: number; y: number; str: string; hasEOL: boolean };
export type BankOperation = { date: string; amount: string; description: string };
type Cell = { x: number; value: string };
type Row = { y: number; cells: Cell[] };

const datePattern = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const amountPattern = /^[+-][\d\s]+[.,]\d{2}$/;
// Колонки справки о движении средств Т-Банка; используются, если заголовок таблицы не найден.
const DEFAULT_COLUMNS = { date: 56, amount: 199, description: 389, card: 499 };
const TOLERANCE = 8;

/** Читает текстовый слой PDF постранично. */
export async function loadPdfPages(buffer: Buffer): Promise<PdfItem[][]> {
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  try {
    const doc = await task.promise;
    const pages: PdfItem[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(
        content.items
          .filter(
            (item): item is typeof item & { str: string; transform: number[] } =>
              'str' in item && 'transform' in item,
          )
          .map((item) => ({
            x: Math.round(item.transform[4]),
            y: Math.round(item.transform[5]),
            str: item.str,
            hasEOL: 'hasEOL' in item && Boolean(item.hasEOL),
          })),
      );
    }
    return pages;
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError('PDF повреждён или защищён паролем. Используйте текстовый PDF или CSV.');
  } finally {
    await task.destroy();
  }
}

/** Номера карт, счетов, договоров и телефонов: оставляем только последние 4 цифры. */
export function maskNumbers(text: string) {
  return text.replace(/\+?\d(?:[\d\s-]*\d)?/g, (match) => {
    const digits = match.replace(/\D/g, '');
    return digits.length >= 6 ? `•••• ${digits.slice(-4)}` : match;
  });
}

function rowsOf(items: PdfItem[]): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    const value = item.str.trim();
    if (!value) continue;
    const row = rows.find((r) => Math.abs(r.y - item.y) <= 2);
    if (row) row.cells.push({ x: item.x, value });
    else rows.push({ y: item.y, cells: [{ x: item.x, value }] });
  }
  rows.sort((a, b) => b.y - a.y);
  for (const row of rows) row.cells.sort((a, b) => a.x - b.x);
  return rows;
}

function columnsOf(rows: Row[]) {
  for (const row of rows) {
    const find = (re: RegExp) => row.cells.find((c) => re.test(c.value))?.x;
    const date = find(/^Дата и время/i);
    const description = find(/^Описание/i);
    if (date === undefined || description === undefined) continue;
    return {
      date,
      amount: find(/^Сумма операции/i) ?? find(/^Сумма/i) ?? DEFAULT_COLUMNS.amount,
      description,
      card: find(/^Номер/i) ?? Number.POSITIVE_INFINITY,
    };
  }
  return DEFAULT_COLUMNS;
}

const near = (x: number, column: number) => Math.abs(x - column) <= TOLERANCE;

/**
 * Разбирает таблицу операций банковской выписки. Шапка (ФИО, адрес, номера счёта и договора),
 * подвал и номера карт отбрасываются; в описаниях длинные номера маскируются.
 */
export function readBankTable(pages: PdfItem[][]) {
  const operations: BankOperation[] = [];
  const ambiguousDates: (string | null)[] = [];
  let columns = DEFAULT_COLUMNS as ReturnType<typeof columnsOf>;
  for (const items of pages) {
    const rows = rowsOf(items);
    const found = columnsOf(rows);
    if (found !== DEFAULT_COLUMNS) columns = found;
    let current: { operation: BankOperation; parts: string[] } | undefined;
    const finish = () => {
      if (!current) return;
      current.operation.description = maskNumbers(current.parts.join(' ').replace(/\s+/g, ' '))
        .trim()
        .slice(0, 200);
      operations.push(current.operation);
      current = undefined;
    };
    for (const row of rows) {
      const dateCell = row.cells.find((c) => near(c.x, columns.date) && datePattern.test(c.value));
      const amounts = row.cells.filter(
        (c) => near(c.x, columns.amount) && amountPattern.test(c.value),
      );
      const text = row.cells
        .filter((c) => c.x >= columns.description - TOLERANCE && c.x < columns.card - TOLERANCE)
        .map((c) => c.value);
      if (dateCell) {
        finish();
        const [, d, m, y] = datePattern.exec(dateCell.value)!;
        const date = `${y}-${m}-${d}`;
        if (
          !dateSchema.safeParse(date).success ||
          amounts.length !== 1 ||
          parseMoney(amounts[0].value) === null
        ) {
          ambiguousDates.push(dateSchema.safeParse(date).success ? date : null);
          continue;
        }
        current = {
          operation: {
            date,
            amount: amounts[0].value.replace(/\s/g, '').replace(',', '.'),
            description: '',
          },
          parts: text,
        };
      } else if (current) {
        current.parts.push(...text);
      }
    }
    finish();
  }
  return { operations, ambiguousDates };
}
