import { describe, expect, it } from 'vitest';
import type { Assumptions } from '../shared/budget-calculation';
import { decideScenario, parseScenarioQuestion, simulatePlannedExpense } from '../shared/scenarios';
import type { Transaction } from '../shared/transactions';

const assumptions: Assumptions = {
  asOf: '2026-09-25',
  endDate: '2026-09-30',
  currentBalanceKopecks: 2_140_000,
  futurePaymentsKopecks: 890_000,
  futureIncomeKopecks: 0,
  dailySpendKopecks: 60_000,
};
const history: Transaction[] = [
  { sourceId: 'income', date: '2026-09-01', description: 'Подработка', amountKopecks: 3_000_000, direction: 'income', category: 'Подработка', recurring: false, suspicious: false, note: '' },
  { sourceId: 'cafe', date: '2026-09-05', description: 'Кафе', amountKopecks: 100_000, direction: 'expense', category: 'Кафе', recurring: false, suspicious: false, note: '' },
];

describe('what-if question and forecast', () => {
  it('recognizes a purchase and monthly rent without floating point amounts', () => {
    expect(parseScenarioQuestion('Что будет, если куплю телефон за 50 000?')).toEqual({
      ok: true,
      expense: { description: 'телефон', amountKopecks: 5_000_000, frequency: 'once' },
    });
    expect(parseScenarioQuestion('Если сниму квартиру за 25 000,50 ₽?')).toEqual({
      ok: true,
      expense: { description: 'квартиру', amountKopecks: 2_500_050, frequency: 'monthly' },
    });
    expect(parseScenarioQuestion('Если куплю телефон без цены').ok).toBe(false);
    expect(parseScenarioQuestion('Если сниму квартиру за 0 ₽').ok).toBe(false);
  });

  it('shows the purchase cost, lower daily limit and deficit from the same base budget', () => {
    const result = simulatePlannedExpense([], assumptions, {
      description: 'телефон',
      amountKopecks: 5_000_000,
      frequency: 'once',
      firstPaymentDate: '2026-09-26',
    });
    expect(result.base.projected).toBe(950_000);
    expect(result.paymentDates).toEqual(['2026-09-26']);
    expect(result.totalCostKopecks).toBe(5_000_000);
    expect(result.budget.projected).toBe(-4_050_000);
    expect(result.projectedChangeKopecks).toBe(-5_000_000);
    expect(result.shortfallKopecks).toBe(4_050_000);
    expect(result.budget.dailyLimit).toBe(-750_000);
    expect(assumptions.futurePaymentsKopecks).toBe(890_000);
  });

  it('counts rent only on payment dates within the selected period, clamping short months', () => {
    const result = simulatePlannedExpense(
      [],
      {
        ...assumptions,
        asOf: '2027-01-30',
        endDate: '2027-04-30',
      },
      {
        description: 'квартиру',
        amountKopecks: 2_500_000,
        frequency: 'monthly',
        firstPaymentDate: '2027-01-31',
      },
    );
    expect(result.paymentDates).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
    expect(result.totalCostKopecks).toBe(10_000_000);
    expect(result.projectedChangeKopecks).toBe(-10_000_000);
  });

  it('keeps a missing forecast missing while still showing cost and excludes later purchases', () => {
    const expense = {
      description: 'квартиру',
      amountKopecks: 2_500_000,
      frequency: 'monthly' as const,
      firstPaymentDate: '2026-09-26',
    };
    const missing = simulatePlannedExpense(
      [],
      { ...assumptions, currentBalanceKopecks: null },
      expense,
    );
    expect(missing.totalCostKopecks).toBe(2_500_000);
    expect(missing.budget.projected).toBeNull();
    expect(missing.projectedChangeKopecks).toBeNull();
    const later = simulatePlannedExpense([], assumptions, {
      ...expense,
      firstPaymentDate: '2026-10-01',
    });
    expect(later.paymentDates).toEqual([]);
    expect(later.budget.projected).toBe(950_000);
  });

  it('includes a changed daily spending plan in the comparison', () => {
    const result = simulatePlannedExpense(
      [],
      assumptions,
      {
        description: 'проездной',
        amountKopecks: 200_000,
        frequency: 'once',
        firstPaymentDate: '2026-09-26',
      },
      40_000,
    );
    expect(result.budget.projected).toBe(850_000);
    expect(result.projectedChangeKopecks).toBe(-100_000);
  });

  it('estimates a waiting date from observed net savings, explicitly not from a payment schedule', () => {
    const comparison = simulatePlannedExpense(history, assumptions, {
      description: 'телефон', amountKopecks: 5_000_000, frequency: 'once', firstPaymentDate: '2026-09-26',
    });
    const decision = decideScenario(history, comparison);
    expect(decision.recommendation).toBe('wait');
    expect(decision.waitDays).toBeGreaterThan(0);
    expect(decision.waitUntil).toMatch(/^2026-/);
    expect(decision.reason).toContain('неизвестна');
  });

  it('finds a feasible cut in a discretionary category for a small shortfall', () => {
    const comparison = simulatePlannedExpense(history, assumptions, {
      description: 'наушники', amountKopecks: 970_000, frequency: 'once', firstPaymentDate: '2026-09-26',
    });
    const decision = decideScenario(history, comparison);
    expect(decision.recommendation).toBe('cut_spending');
    expect(decision.dailyCutKopecks).toBe(4_000);
    expect(decision.cutCategory).toBe('Кафе');
  });

  it('does not recommend a recurring payment beyond the historical monthly capacity', () => {
    const comparison = simulatePlannedExpense(history, assumptions, {
      description: 'квартира', amountKopecks: 5_000_000, frequency: 'monthly', firstPaymentDate: '2026-09-26',
    });
    expect(decideScenario(history, comparison).recommendation).toBe('insufficient_data');
  });

  it('does not invent a waiting date without adequate history', () => {
    const comparison = simulatePlannedExpense([], assumptions, {
      description: 'телефон', amountKopecks: 5_000_000, frequency: 'once', firstPaymentDate: '2026-09-26',
    });
    expect(decideScenario([], comparison).waitUntil).toBeNull();
  });
});
