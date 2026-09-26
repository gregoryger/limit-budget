import { z } from 'zod';
import { dateSchema, moneySchema, type Transaction } from './transactions.js';
export const assumptionsSchema = z
  .object({
    asOf: dateSchema,
    endDate: dateSchema,
    currentBalanceKopecks: moneySchema.nullable(),
    futurePaymentsKopecks: moneySchema.nullable(),
    futureIncomeKopecks: moneySchema,
    dailySpendKopecks: moneySchema,
  })
  .strict()
  .refine(
    (x) => x.endDate >= x.asOf && daysBetween(x.asOf, x.endDate) <= 366,
    'Период должен быть от 0 до 366 дней',
  );
export type Assumptions = z.infer<typeof assumptionsSchema>;
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export function calculateBudget(transactions: Transaction[], input: Assumptions) {
  const a = assumptionsSchema.parse(input);
  const income = transactions
    .filter((t) => t.direction === 'income')
    .reduce((s, t) => s + t.amountKopecks, 0);
  const expenses = transactions
    .filter((t) => t.direction === 'expense')
    .reduce((s, t) => s + t.amountKopecks, 0);
  const byCategory: Record<string, number> = {};
  transactions
    .filter((t) => t.direction === 'expense')
    .forEach((t) => (byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amountKopecks));
  const days = daysBetween(a.asOf, a.endDate); // Balance is at end of asOf day; start tomorrow.
  const complete = a.currentBalanceKopecks !== null && a.futurePaymentsKopecks !== null;
  const available = complete
    ? a.currentBalanceKopecks! + a.futureIncomeKopecks - a.futurePaymentsKopecks!
    : null;
  const projected = available === null ? null : available - days * a.dailySpendKopecks;
  const recurring = transactions.filter((t) => t.recurring && t.direction === 'expense');
  return {
    income,
    expenses,
    net: income - expenses,
    byCategory,
    days,
    available,
    projected,
    dailyLimit: available === null || days === 0 ? null : Math.floor(available / days),
    recurring,
    complete,
    assumptions: a,
  };
}
export type Budget = ReturnType<typeof calculateBudget>;
