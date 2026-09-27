import { loadPdfPages, readBankTable } from './bank-table.js';
import { InputError } from './parser.js';

/** Reads only date and signed amount columns. Headers, names, card numbers and descriptions are discarded. */
export async function anonymizeBankTablePdf(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString() !== '%PDF-')
    throw new InputError('Нужен текстовый PDF с таблицей операций.');
  const { operations, ambiguousDates } = readBankTable(await loadPdfPages(buffer));
  if (!operations.length)
    throw new InputError(
      'Таблица операций не распознана. Поддерживается текстовый PDF с датой в первой колонке и подписанной суммой в третьей.',
    );
  const lines = ['date;description;amount;direction'];
  for (const { date, amount } of operations) {
    const income = amount.startsWith('+');
    lines.push(
      `${date};${income ? 'Поступление' : 'Расход'};${amount};${income ? 'income' : 'expense'}`,
    );
  }
  for (const date of ambiguousDates) if (date) lines.push(`${date};Неоднозначная строка;;unknown`);
  return {
    csv: `${lines.join('\n')}\n`,
    operations: operations.length,
    ambiguous: ambiguousDates.length,
  };
}
