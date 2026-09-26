import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { dateSchema, parseMoney } from '../../shared/transactions.js';
import { InputError } from './parser.js';

type Cell = { x: number; y: number; value: string };
const datePattern = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const amountPattern = /^[+-][\d\s]+[.,]\d{2}$/;

/** Reads only date and signed amount columns. Headers, names, card numbers and descriptions are discarded. */
export async function anonymizeBankTablePdf(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString() !== '%PDF-')
    throw new InputError('Нужен текстовый PDF с таблицей операций.');
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const lines = ['date;description;amount;direction'];
  let operations = 0;
  let ambiguous = 0;
  try {
    const document = await task.promise;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const content = await (await document.getPage(pageNumber)).getTextContent();
      const cells: Cell[] = content.items
        .filter((item): item is typeof item & { str: string; transform: number[] } =>
          'str' in item && 'transform' in item,
        )
        .map((item) => ({
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
          value: item.str.trim(),
        }));
      const dates = cells.filter(
        (cell) => cell.x >= 52 && cell.x <= 65 && datePattern.test(cell.value),
      );
      const amounts = cells.filter(
        (cell) => cell.x >= 195 && cell.x <= 205 && amountPattern.test(cell.value),
      );
      for (const cell of dates) {
        const parts = datePattern.exec(cell.value)!;
        const date = `${parts[3]}-${parts[2]}-${parts[1]}`;
        if (!dateSchema.safeParse(date).success) {
          ambiguous++;
          continue;
        }
        const matching = amounts.filter((amount) => Math.abs(amount.y - cell.y) <= 2);
        if (matching.length !== 1 || parseMoney(matching[0].value) === null) {
          lines.push(`${date};Неоднозначная строка;;unknown`);
          ambiguous++;
          continue;
        }
        const amount = matching[0].value.replace(/\s/g, '').replace(',', '.');
        const income = amount.startsWith('+');
        lines.push(`${date};${income ? 'Поступление' : 'Расход'};${amount};${income ? 'income' : 'expense'}`);
        operations++;
      }
    }
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError('Не удалось прочитать PDF. Проверьте, что он не защищён паролем.');
  } finally {
    await task.destroy();
  }
  if (!operations)
    throw new InputError(
      'Таблица операций не распознана. Поддерживается текстовый PDF с датой в первой колонке и подписанной суммой в третьей.',
    );
  return { csv: `${lines.join('\n')}\n`, operations, ambiguous };
}
