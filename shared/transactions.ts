import { z } from 'zod';
export const categories = [
  'Подработка',
  'Стипендия',
  'Продукты',
  'Кафе',
  'Транспорт',
  'Жильё',
  'Подписки',
  'Переводы',
  'Другое',
] as const;
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Некорректная дата',
  );
export const moneySchema = z.number().int().min(0).max(100_000_000_00);
export const transactionSchema = z
  .object({
    sourceId: z.string().min(1),
    date: dateSchema,
    description: z.string().min(1).max(500),
    amountKopecks: moneySchema,
    direction: z.enum(['income', 'expense']),
    category: z.enum(categories),
    recurring: z.boolean(),
    suspicious: z.boolean(),
    note: z.string().max(500),
  })
  .strict();
export const modelResponseSchema = z
  .object({
    transactions: z.array(transactionSchema),
    skipped: z.array(
      z.object({ sourceId: z.string(), reason: z.string().min(1).max(500) }).strict(),
    ),
  })
  .strict();
export type Transaction = z.infer<typeof transactionSchema>;
export type SourceRow = {
  id: string;
  raw: string;
  date: string | null;
  description: string | null;
  amountKopecks: number | null;
  direction: 'income' | 'expense' | null;
  issue?: string;
  /** Строка разобрана из табличной PDF-выписки банка: дата, сумма и описание уже проверены. */
  origin?: 'bank-table';
};
export type ReviewRow = { source: SourceRow; transaction: Transaction | null; issues: string[] };
export type ImportResult = {
  id: string;
  filename: string;
  mode: 'demo' | 'gigachat';
  notice: string;
  rows: ReviewRow[];
  expiresAt: number;
};
export function parseMoney(value: string): number | null {
  const normalized = value.replace(/[\s\u00a0₽]/g, '').replace(',', '.');
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.replace(/^[+-]/, '').split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= 100_000_000_00 ? amount : null;
}
export const rub = (n: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
  }).format(n / 100);
