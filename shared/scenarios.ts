import { z } from 'zod';
import { calculateBudget, daysBetween, type Assumptions, type Budget } from './budget-calculation.js';
import { dateSchema, moneySchema, parseMoney, type Transaction } from './transactions.js';

export const plannedExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(100),
    amountKopecks: moneySchema.positive(),
    frequency: z.enum(['once', 'monthly']),
    firstPaymentDate: dateSchema,
  })
  .strict();
export type PlannedExpense = z.infer<typeof plannedExpenseSchema>;

export type QuestionResult =
  { ok: true; expense: Omit<PlannedExpense, 'firstPaymentDate'> } | { ok: false; message: string };

// A deliberately narrow, predictable interpretation. The user can edit every recognized field.
export function parseScenarioQuestion(question: string): QuestionResult {
  const normalized = question
    .trim()
    .replace(/^что будет[,.!\s]*если\s+/i, '')
    .replace(/^если\s+/i, '');
  const match = normalized.match(
    /^(куплю|покупаю|приобрету|сниму|арендую|буду\s+снимать)\s+(.+?)\s+за\s+([\d\s\u00a0]+(?:[.,]\d{1,2})?)\s*(?:₽|руб(?:лей|ля|\.)?)?\s*[?.!]*$/i,
  );
  if (!match)
    return {
      ok: false,
      message:
        'Пока понимаю покупки и аренду в формате «Куплю телефон за 50 000 ₽» или «Сниму квартиру за 25 000 ₽». Ниже можно задать сценарий вручную.',
    };
  const amountKopecks = parseMoney(match[3]);
  if (amountKopecks === null || amountKopecks === 0)
    return { ok: false, message: 'Укажите положительную сумму в рублях, не больше 100 млн ₽.' };
  return {
    ok: true,
    expense: {
      description: match[2].trim(),
      amountKopecks,
      frequency: /^(сниму|арендую|буду\s+снимать)$/i.test(match[1]) ? 'monthly' : 'once',
    },
  };
}

function paymentDates(expense: PlannedExpense, a: Assumptions): string[] {
  if (expense.firstPaymentDate <= a.asOf || expense.firstPaymentDate > a.endDate) return [];
  if (expense.frequency === 'once') return [expense.firstPaymentDate];
  const first = new Date(`${expense.firstPaymentDate}T00:00:00Z`);
  const anchorDay = first.getUTCDate();
  const dates: string[] = [];
  // The forecast is at most 366 days. Clamp the payment day to the end of short months.
  for (let offset = 0; offset <= 12; offset++) {
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth() + offset;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const date = new Date(Date.UTC(year, month, Math.min(anchorDay, lastDay)))
      .toISOString()
      .slice(0, 10);
    if (date > a.endDate) break;
    dates.push(date);
  }
  return dates;
}

export type ScenarioComparison = {
  base: Budget;
  budget: Budget;
  expense: PlannedExpense;
  paymentDates: string[];
  totalCostKopecks: number;
  projectedChangeKopecks: number | null;
  shortfallKopecks: number | null;
};

export type ScenarioDecision = {
  recommendation: 'buy_now' | 'wait' | 'cut_spending' | 'insufficient_data';
  reason: string;
  waitDays: number | null;
  waitUntil: string | null;
  estimatedDailySavingsKopecks: number | null;
  dailyCutKopecks: number | null;
  cutCategory: string | null;
  recurringAffordable: boolean | null;
};

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
}

// A historical trend is only an estimate, never a scheduled future receipt.
function dailySavingsEstimate(transactions: Transaction[], asOf: string): number | null {
  const relevant = transactions.filter((t) => t.date <= asOf);
  if (!relevant.length) return null;
  const firstDate = relevant.reduce((first, t) => (t.date < first ? t.date : first), asOf);
  const observedDays = daysBetween(firstDate, asOf) + 1;
  if (observedDays < 14 || !relevant.some((t) => t.direction === 'income')) return null;
  const net = relevant.reduce(
    (sum, t) => sum + (t.direction === 'income' ? t.amountKopecks : -t.amountKopecks),
    0,
  );
  return net > 0 ? Math.floor(net / observedDays) : null;
}

export function decideScenario(
  transactions: Transaction[],
  comparison: ScenarioComparison,
): ScenarioDecision {
  const { base, budget, expense, shortfallKopecks } = comparison;
  const a = base.assumptions;
  const estimatedDailySavingsKopecks = dailySavingsEstimate(transactions, a.asOf);
  const recurringAffordable =
    expense.frequency === 'monthly'
      ? estimatedDailySavingsKopecks === null
        ? null
        : estimatedDailySavingsKopecks * 30 >= Math.ceil(expense.amountKopecks * 1.1)
      : null;
  const discretionary = ['Кафе', 'Подписки', 'Другое', 'Переводы'] as const;
  const observed = transactions.filter((t) => t.date <= a.asOf);
  const firstObservedDate = observed.reduce((first, t) => (t.date < first ? t.date : first), a.asOf);
  const observedDays = daysBetween(firstObservedDate, a.asOf) + 1;
  const dailyCutKopecks =
    shortfallKopecks !== null && shortfallKopecks > 0 && base.days > 0
      ? Math.ceil(shortfallKopecks / base.days)
      : null;
  const cutCategory =
    dailyCutKopecks !== null && dailyCutKopecks <= a.dailySpendKopecks
      ? discretionary.find((category) => {
          const spent = base.byCategory[category] ?? 0;
          return spent > 0 && Math.floor(spent / observedDays) >= dailyCutKopecks;
        }) ?? null
      : null;
  const waitDays =
    shortfallKopecks !== null &&
    shortfallKopecks > 0 &&
    estimatedDailySavingsKopecks !== null &&
    recurringAffordable !== false
      ? Math.ceil(shortfallKopecks / estimatedDailySavingsKopecks)
      : null;
  const waitUntil = waitDays === null ? null : addDays(a.endDate, waitDays);
  const baseDecision = {
    waitDays,
    waitUntil,
    estimatedDailySavingsKopecks,
    dailyCutKopecks,
    cutCategory,
    recurringAffordable,
  };
  if (!base.complete)
    return {
      ...baseDecision,
      recommendation: 'insufficient_data',
      reason: 'Укажите текущий остаток и будущие обязательные платежи в «Обзоре».',
    };
  if (!comparison.paymentDates.length)
    return {
      ...baseDecision,
      recommendation: 'insufficient_data',
      reason: 'Первый платёж за пределами выбранного периода. Продлите период прогноза в «Обзоре».',
    };
  if (recurringAffordable === false)
    return {
      ...baseDecision,
      recommendation: 'insufficient_data',
      reason: 'Повторяющийся платёж превышает оценку свободных средств за месяц с резервом 10%. Нужен более дешёвый вариант или новый план доходов.',
    };
  if (expense.frequency === 'monthly' && recurringAffordable === null)
    return {
      ...baseDecision,
      recommendation: 'insufficient_data',
      reason: 'Первый платёж можно рассчитать, но для решения о ежемесячном расходе недостаточно истории накоплений за 14 дней.',
    };
  if (
    comparison.paymentDates[0] === addDays(a.asOf, 1) &&
    a.currentBalanceKopecks !== null &&
    a.currentBalanceKopecks < expense.amountKopecks
  )
    return {
      ...baseDecision,
      recommendation: waitDays !== null ? 'wait' : 'insufficient_data',
      reason: 'На дату остатка денег на первый платёж не хватает; дата будущего дохода неизвестна.',
    };
  if (budget.projected !== null && budget.projected >= 0) {
    return {
      ...baseDecision,
      recommendation: 'buy_now',
      reason: 'К концу выбранного периода новый платёж укладывается в план. Проверьте остаток непосредственно перед оплатой: даты остальных поступлений и обязательств неизвестны.',
    };
  }
  if (cutCategory)
    return {
      ...baseDecision,
      recommendation: 'cut_spending',
      reason: `Покупка укладывается в план, если сократить повседневные расходы минимум на ${dailyCutKopecks} копеек в день до конца периода. «${cutCategory}» — пример статьи из вашей выписки, не автоматическое изменение бюджета.`,
    };
  if (waitDays !== null)
    return {
      ...baseDecision,
      recommendation: 'wait',
      reason: 'Сейчас расход создаёт дефицит. Срок ожидания оценён по прошлому чистому притоку; будущие поступления и платежи после конца периода неизвестны.',
    };
  return {
    ...baseDecision,
    recommendation: 'insufficient_data',
    reason: 'Сейчас расход создаёт дефицит. Надёжный срок ожидания нельзя оценить без устойчивой истории накоплений или плана будущих доходов.',
  };
}

export function simulatePlannedExpense(
  transactions: Transaction[],
  assumptions: Assumptions,
  input: PlannedExpense,
  dailySpendKopecks = assumptions.dailySpendKopecks,
): ScenarioComparison {
  const expense = plannedExpenseSchema.parse(input);
  moneySchema.parse(dailySpendKopecks);
  const base = calculateBudget(transactions, assumptions);
  if (expense.firstPaymentDate <= base.assumptions.asOf)
    throw new Error('Первый платёж должен быть позже даты остатка.');
  const dates = paymentDates(expense, base.assumptions);
  const totalCostKopecks = expense.amountKopecks * dates.length;
  const available = base.available === null ? null : base.available - totalCostKopecks;
  const projected = available === null ? null : available - base.days * dailySpendKopecks;
  const budget: Budget = {
    ...base,
    available,
    projected,
    dailyLimit: available === null || base.days === 0 ? null : Math.floor(available / base.days),
    assumptions: { ...base.assumptions, dailySpendKopecks },
  };
  return {
    base,
    budget,
    expense,
    paymentDates: dates,
    totalCostKopecks,
    projectedChangeKopecks:
      base.projected === null || projected === null ? null : projected - base.projected,
    shortfallKopecks: projected === null ? null : Math.max(0, -projected),
  };
}

// Keep the transfer simulator's existing contract for the separate Transfers screen.
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
