import { z } from 'zod';
import { moneySchema } from './transactions.js';

export const obligationCategories = [
  { key: 'housing', label: 'Аренда и жильё' },
  { key: 'communication', label: 'Связь' },
  { key: 'transport', label: 'Транспорт' },
  { key: 'subscriptions', label: 'Подписки' },
  { key: 'other', label: 'Другие обязательные платежи' },
] as const;

export const obligationBreakdownSchema = z
  .object({
    housing: moneySchema,
    communication: moneySchema,
    transport: moneySchema,
    subscriptions: moneySchema,
    other: moneySchema,
  })
  .strict()
  .refine(
    (values) => Object.values(values).reduce((sum, amount) => sum + amount, 0) <= 100_000_000_00,
    {
      message: 'Общая сумма обязательств не должна превышать 100 млн ₽.',
    },
  );

export type ObligationBreakdown = z.infer<typeof obligationBreakdownSchema>;
export type ObligationCategory = keyof ObligationBreakdown;

export function totalObligations(values: ObligationBreakdown): number {
  return obligationCategories.reduce((sum, category) => sum + values[category.key], 0);
}

export function unallocatedObligations(totalKopecks: number | null): ObligationBreakdown | null {
  if (totalKopecks === null) return null;
  return { housing: 0, communication: 0, transport: 0, subscriptions: 0, other: totalKopecks };
}

export function calculateFreeMoney(
  currentBalanceKopecks: number | null,
  breakdown: ObligationBreakdown | null,
) {
  if (currentBalanceKopecks !== null) moneySchema.parse(currentBalanceKopecks);
  const obligations = breakdown === null ? null : obligationBreakdownSchema.parse(breakdown);
  const reservedKopecks = obligations === null ? null : totalObligations(obligations);
  const afterObligationsKopecks =
    currentBalanceKopecks === null || reservedKopecks === null
      ? null
      : currentBalanceKopecks - reservedKopecks;
  return {
    reservedKopecks,
    afterObligationsKopecks,
    freeKopecks: afterObligationsKopecks === null ? null : Math.max(0, afterObligationsKopecks),
    deficitKopecks: afterObligationsKopecks === null ? null : Math.max(0, -afterObligationsKopecks),
  };
}
