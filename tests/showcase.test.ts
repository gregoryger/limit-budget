import { describe, expect, it } from 'vitest';
import { calculateBudget } from '../shared/budget-calculation';
import {
  activeSubscriptions,
  createShowcaseData,
  demoObligations,
  monthsToGoal,
  parseScenarioQuery,
  spendingInsights,
} from '../shared/showcase';

describe('showcase calculations', () => {
  const demo = createShowcaseData(new Date(2026, 8, 26));

  it('opens with coherent synthetic numbers', () => {
    const budget = calculateBudget(demo.transactions, demo.assumptions);
    expect(budget.days).toBe(30);
    expect(demo.assumptions.futurePaymentsKopecks).toBe(
      demoObligations.reduce((sum, item) => sum + item.amountKopecks, 0),
    );
    expect(demo.assumptions.currentBalanceKopecks! - demo.assumptions.futurePaymentsKopecks!).toBe(
      2_430_300,
    );
    expect(budget.projected).toBe(5_680_300);
  });

  it('finds explainable patterns and counts each active subscription once', () => {
    const insights = spendingInsights(demo.transactions, demo.assumptions.asOf);
    expect(insights.small.length).toBeGreaterThan(0);
    expect(insights.convenienceTotal).toBe(5_260_00);
    expect(insights.currentCafe).toBeGreaterThan(insights.previousCafe);
    const subscriptions = activeSubscriptions(demo.transactions, demo.assumptions.asOf);
    expect(subscriptions).toHaveLength(3);
    expect(subscriptions.reduce((sum, item) => sum + item.amountKopecks, 0)).toBe(104_700);
  });

  it('understands demo questions and handles a goal with no monthly saving', () => {
    expect(parseScenarioQuery('Куплю телефон за 50 000 ₽')).toMatchObject({
      amountKopecks: 5_000_000,
      recurring: false,
    });
    expect(parseScenarioQuery('Сниму квартиру за 25 тыс в месяц')).toMatchObject({
      amountKopecks: 2_500_000,
      recurring: true,
    });
    expect(parseScenarioQuery('Хочу телефон')).toBeNull();
    expect(monthsToGoal(10_000_000, 0, 1_400_300)).toBe(8);
    expect(monthsToGoal(10_000_000, 0, 0)).toBeNull();
  });
});
