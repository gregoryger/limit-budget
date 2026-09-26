import type { z } from 'zod';
import { advisorRequestSchema } from '../../shared/advisor.js';
import { calculateBudget } from '../../shared/budget-calculation.js';
import { simulate } from '../../shared/scenarios.js';
import { activeSubscriptions, monthsToGoal, spendingInsights } from '../../shared/showcase.js';
import { rub, type Transaction } from '../../shared/transactions.js';
import { adviseWithGigaChat } from './adapter.js';

type Request = z.infer<typeof advisorRequestSchema>;

export function advisorFacts(payload: Request, transactions: Transaction[], demo: boolean) {
  const { assumptions, screen } = payload;
  const budget = calculateBudget(transactions, assumptions);
  const balance = assumptions.currentBalanceKopecks;
  const payments = assumptions.futurePaymentsKopecks;
  const base = {
    source: demo ? 'вымышленные демонстрационные данные' : 'подтверждённая обезличенная выписка',
    screen,
    period: { from: assumptions.asOf, to: assumptions.endDate, days: budget.days },
    currentBalance: balance === null ? null : rub(balance),
    futurePayments: payments === null ? null : rub(payments),
    futureIncome: rub(assumptions.futureIncomeKopecks),
    dailySpend: rub(assumptions.dailySpendKopecks),
    freeNow: balance === null || payments === null ? null : rub(balance - payments),
    projected: budget.projected === null ? null : rub(budget.projected),
    dailyLimit: budget.dailyLimit === null ? null : rub(budget.dailyLimit),
    historicalIncome: rub(budget.income),
    historicalExpenses: rub(budget.expenses),
  };
  let screenFacts: unknown = {};
  if (screen === 'Сценарии' || screen === 'Переводы') {
    const scenario = payload.scenario;
    if (scenario) {
      const result = simulate(
        transactions,
        assumptions,
        scenario.dailySpendKopecks,
        scenario.amountKopecks,
      );
      screenFacts = {
        kind: scenario.recurring
          ? 'ежемесячный платёж, один раз в данном периоде'
          : 'разовый расход',
        amount: rub(scenario.amountKopecks),
        dailySpend: rub(scenario.dailySpendKopecks),
        resultProjected: result.projected === null ? null : rub(result.projected),
        changeFromBase:
          result.projected === null || budget.projected === null
            ? null
            : rub(result.projected - budget.projected),
      };
    }
  } else if (screen === 'Детектив') {
    const insight = spendingInsights(transactions, assumptions.asOf);
    screenFacts = {
      smallPurchases: { count: insight.small.length, total: rub(insight.smallTotal) },
      deliveryAndTaxi: { count: insight.convenience.length, total: rub(insight.convenienceTotal) },
      cafeCurrent30Days: rub(insight.currentCafe),
      cafePrevious30Days: rub(insight.previousCafe),
      examples: insight.convenience
        .slice(0, 7)
        .map((item) => ({ description: item.description, amount: rub(item.amountKopecks) })),
    };
  } else if (screen === 'Цели') {
    const goal = payload.goal ?? {
      targetKopecks: 10_000_000,
      savedKopecks: 0,
      monthlyKopecks: Math.max(
        0,
        assumptions.futureIncomeKopecks -
          (assumptions.futurePaymentsKopecks ?? 0) -
          assumptions.dailySpendKopecks * 30,
      ),
    };
    screenFacts = {
      target: rub(goal.targetKopecks),
      saved: rub(goal.savedKopecks),
      monthlySaving: rub(goal.monthlyKopecks),
      monthsToGoal: monthsToGoal(goal.targetKopecks, goal.savedKopecks, goal.monthlyKopecks),
    };
  } else if (screen === 'Подписки') {
    const subscriptions = activeSubscriptions(transactions, assumptions.asOf);
    const paused = new Set(payload.pausedSubscriptionIds ?? []);
    const monthly = subscriptions.reduce((sum, item) => sum + item.amountKopecks, 0);
    const saving = subscriptions
      .filter((item) => paused.has(item.sourceId))
      .reduce((sum, item) => sum + item.amountKopecks, 0);
    screenFacts = {
      subscriptions: subscriptions.map((item) => ({
        name: item.description,
        monthly: rub(item.amountKopecks),
        markedForSimulation: paused.has(item.sourceId),
      })),
      monthlyTotal: rub(monthly),
      yearlyTotal: rub(monthly * 12),
      simulatedYearlySaving: rub(saving * 12),
      cancellationPerformed: false,
    };
  } else if (screen === 'Обзор' || screen === 'Карты и счета') {
    screenFacts = {
      note: 'Свободные деньги равны текущему остатку минус будущие обязательные платежи. Будущий доход включён только в прогноз.',
    };
  }
  return {
    request: payload.question ?? `Кратко объясни экран «${screen}» и предложи следующий шаг.`,
    recentDialogue: payload.history,
    calculations: base,
    screenFacts,
  };
}

export async function answerAdvisor(payload: Request, transactions: Transaction[], demo: boolean) {
  return adviseWithGigaChat(advisorFacts(payload, transactions, demo));
}
