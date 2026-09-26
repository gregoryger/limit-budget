import { parse } from 'csv-parse/sync';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { dateSchema, parseMoney, type SourceRow } from '../../shared/transactions.js';
export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
function date(value: string): string | null {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  const normalized = parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : value;
  return dateSchema.safeParse(normalized).success ? normalized : null;
}
function row(
  id: string,
  raw: string,
  d: string,
  description: string,
  amount: string,
  direction: string,
): SourceRow {
  const dir =
    direction === 'income' || direction === 'expense'
      ? direction
      : amount.startsWith('-')
        ? 'expense'
        : amount.startsWith('+')
          ? 'income'
          : null;
  const conflict =
    (amount.startsWith('-') && dir === 'income') || (amount.startsWith('+') && dir === 'expense');
  return {
    id,
    raw,
    date: date(d),
    description: description || null,
    amountKopecks: parseMoney(amount),
    direction: conflict ? null : dir,
    ...(conflict ? { issue: 'Знак суммы противоречит направлению' } : {}),
  };
}
export function parseCsv(text: string): SourceRow[] {
  if (!text.trim()) throw new InputError('Выписка пустая.');
  const delimiter = text.split(/\r?\n/)[0].includes(';') ? ';' : ',';
  let records: { record: string[]; raw: string }[];
  try {
    records = parse(text, {
      delimiter,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      raw: true,
      trim: true,
    }) as unknown as typeof records;
  } catch {
    throw new InputError('Не удалось прочитать CSV. Проверьте кавычки и разделитель.');
  }
  const header = records.shift()?.record.map((s) => s.toLowerCase());
  if (
    !header ||
    ['date', 'description', 'amount', 'direction'].some((v, i) => header[i] !== v) ||
    header.length !== 4
  )
    throw new InputError('CSV: нужны столбцы date;description;amount;direction. Скачайте пример.');
  return records.map(({ record: r, raw }, i) =>
    r.length === 4
      ? row(`row-${i + 1}`, raw.trim(), ...(r as [string, string, string, string]))
      : {
          id: `row-${i + 1}`,
          raw: raw.trim(),
          date: null,
          description: null,
          amountKopecks: null,
          direction: null,
          issue: 'В строке должно быть ровно 4 поля',
        },
  );
}
export async function extractStatement(
  buffer: Buffer,
  filename: string,
  mime: string,
): Promise<SourceRow[]> {
  if (!buffer.length) throw new InputError('Выписка пустая.');
  let rows: SourceRow[];
  if (filename.toLowerCase().endsWith('.csv')) {
    if (buffer.length > MAX_CSV_BYTES) throw new InputError('Максимальный размер CSV — 2 МБ.', 413);
    if (
      !['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'].includes(
        mime,
      ) ||
      buffer.includes(0)
    )
      throw new InputError('Файл не похож на текстовый CSV.');
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new InputError('Сохраните CSV в кодировке UTF-8.');
    }
    rows = parseCsv(text);
  } else if (filename.toLowerCase().endsWith('.pdf')) {
    if (
      !['application/pdf', 'application/octet-stream'].includes(mime) ||
      buffer.subarray(0, 5).toString() !== '%PDF-'
    )
      throw new InputError('Неверный тип PDF.');
    const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
    const lines: string[] = [];
    try {
      const doc = await task.promise;
      for (let p = 1; p <= doc.numPages; p++) {
        const content = await (await doc.getPage(p)).getTextContent();
        let line = '';
        let previousY: number | undefined;
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const y = Math.round(item.transform[5]);
          if (previousY !== undefined && Math.abs(y - previousY) > 3 && line.trim()) {
            lines.push(line.trim());
            line = '';
          }
          line += `${item.str} `;
          previousY = y;
          if (item.hasEOL && line.trim()) {
            lines.push(line.trim());
            line = '';
            previousY = undefined;
          }
        }
        if (line.trim()) lines.push(line.trim());
      }
    } catch (e) {
      if (e instanceof InputError) throw e;
      throw new InputError('PDF повреждён или защищён паролем. Используйте текстовый PDF или CSV.');
    } finally {
      await task.destroy();
    }
    if (!lines.some((line) => line.trim()))
      throw new InputError(
        'В PDF нет текстового слоя. Сканированные PDF и OCR пока не поддерживаются.',
      );
    rows = lines.map((raw, i) => {
      const m =
        /^(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\s+(.+?)\s+([+-][\d\s]+[.,]\d{2})\s*(?:₽|RUB)?$/.exec(
          raw,
        );
      return m && !/[+-]?\d+[.,]\d{2}/.test(m[2])
        ? row(`row-${i + 1}`, raw, m[1], m[2], m[3], '')
        : {
            id: `row-${i + 1}`,
            raw,
            date: null,
            description: null,
            amountKopecks: null,
            direction: null,
            issue: 'Неоднозначная строка PDF: проверьте вручную или исключите заголовок',
          };
    });
  } else throw new InputError('Поддерживаются только CSV и текстовый PDF.');
  if (!rows.length) throw new InputError('В выписке нет операций.');
  if (filename.toLowerCase().endsWith('.csv')) {
    if (rows.some((r) => r.raw.length > 1000))
      throw new InputError('Для CSV: не более 1000 символов в строке.');
  }
  // Reject common unmasked card/account identifiers before any external request.
  if (rows.some((r) => /(?:\d[ -]?){16,20}/.test(r.raw)))
    throw new InputError(
      'Найдены длинные номера. Замените номера карт и счетов масками перед загрузкой.',
    );
  return rows;
}
