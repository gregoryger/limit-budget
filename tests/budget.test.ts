import { describe, it, expect } from 'vitest';
import { calculateBudget, type Assumptions } from '../shared/budget-calculation';
import { simulate } from '../shared/scenarios';
import { demoResponse } from '../server/gigachat/demo-response';
const assumptions: Assumptions = {
  asOf: '2026-09-25',
  endDate: '2026-09-30',
  currentBalanceKopecks: 2140000,
  futurePaymentsKopecks: 890000,
  futureIncomeKopecks: 0,
  dailySpendKopecks: 60000,
};
describe('budget arithmetic in kopecks', () => {
  it('reconciles exact fixture totals and never adds historic income to current balance', () => {
    const result = calculateBudget(demoResponse.transactions, assumptions);
    expect(result.income).toBe(3150000);
    expect(result.expenses).toBe(1120000);
    expect(result.net).toBe(2030000);
    expect(result.byCategory['Продукты']).toBe(405100);
    expect(result.days).toBe(5);
    expect(result.available).toBe(1250000);
    expect(result.projected).toBe(950000);
    expect(result.dailyLimit).toBe(250000);
    expect(result.recurring).toHaveLength(3);
  });
  it('does not forecast without balance or mandatory payments (zero is an explicit value)', () => {
    expect(
      calculateBudget([], { ...assumptions, currentBalanceKopecks: null }).projected,
    ).toBeNull();
    expect(
      calculateBudget([], { ...assumptions, futurePaymentsKopecks: null }).projected,
    ).toBeNull();
    expect(
      calculateBudget([], { ...assumptions, currentBalanceKopecks: 0, futurePaymentsKopecks: 0 })
        .projected,
    ).toBe(-300000);
  });
  it('handles empty history, zero-day periods and UTC month boundaries', () => {
    const result = calculateBudget([], { ...assumptions, asOf: '2026-09-30' });
    expect(result.income).toBe(0);
    expect(result.expenses).toBe(0);
    expect(result.days).toBe(0);
    expect(result.dailyLimit).toBeNull();
    expect(result.projected).toBe(1250000);
    expect(
      calculateBudget([], { ...assumptions, asOf: '2028-02-28', endDate: '2028-03-01' }).days,
    ).toBe(2);
  });
  it('rejects invalid periods and noninteger or negative amounts', () => {
    expect(() => calculateBudget([], { ...assumptions, endDate: '2026-09-24' })).toThrow();
    expect(() => calculateBudget([], { ...assumptions, dailySpendKopecks: 0.5 })).toThrow();
    expect(() => calculateBudget([], { ...assumptions, currentBalanceKopecks: -1 })).toThrow();
  });
  it('simulates transfers and daily spending without mutating the original budget', () => {
    const result = simulate(demoResponse.transactions, assumptions, 80000, 200000);
    expect(result.projected).toBe(650000);
    expect(assumptions.futurePaymentsKopecks).toBe(890000);
    expect(
      simulate([], { ...assumptions, futurePaymentsKopecks: null }, 0, 100).projected,
    ).toBeNull();
  });
});
