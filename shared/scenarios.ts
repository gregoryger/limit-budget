import { calculateBudget, type Assumptions } from './budget-calculation.js';
import { moneySchema, type Transaction } from './transactions.js';
export function simulate(
  transactions: Transaction[],
  base: Assumptions,
  dailySpendKopecks: number,
  transferKopecks: number,
) {
  moneySchema.parse(transferKopecks);
  moneySchema.parse(dailySpendKopecks);
  return calculateBudget(transactions, {
    ...base,
    dailySpendKopecks,
    futurePaymentsKopecks:
      base.futurePaymentsKopecks === null ? null : base.futurePaymentsKopecks + transferKopecks,
  });
}
