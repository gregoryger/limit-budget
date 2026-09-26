import { z } from 'zod';
import { assumptionsSchema, calculateBudget, type Assumptions } from './budget-calculation.js';
import { moneySchema, type Transaction } from './transactions.js';

export const scenarioQuestionSchema = z
  .object({
    question: z.string().trim().min(3).max(500),
    assumptions: assumptionsSchema,
    importId: z.string().uuid().optional(),
  })
  .strict();

export const scenarioIntentSchema = z
  .object({
    event: z.enum(['expense', 'income', 'saving', 'unclear']),
    frequency: z.enum(['once', 'monthly', 'daily']),
    amountKopecks: moneySchema.nullable(),
    label: z.string().min(2).max(120),
    uncertain: z.boolean(),
    clarification: z.string().max(240),
  })
  .strict();

export const scenarioExplanationSchema = z
  .object({
    summary: z.string().min(1).max(700),
    keyPoints: z.array(z.string().min(1).max(260)).min(2).max(4),
    nextStep: z.string().min(1).max(300),
    followUp: z.string().min(1).max(180),
  })
  .strict();

export type ScenarioIntent = z.infer<typeof scenarioIntentSchema>;
export type ScenarioExplanation = z.infer<typeof scenarioExplanationSchema>;

export function calculateScenarioImpact(
  transactions: Transaction[],
  assumptions: Assumptions,
  intent: ScenarioIntent,
) {
  const base = calculateBudget(transactions, assumptions);
  if (intent.event === 'unclear' || intent.amountKopecks === null || intent.amountKopecks === 0)
    return null;
  const occurrences =
    intent.frequency === 'daily'
      ? base.days
      : intent.frequency === 'monthly'
        ? Math.max(1, Math.ceil(base.days / 30))
        : 1;
  const periodAmountKopecks = intent.amountKopecks * occurrences;
  const signedChangeKopecks =
    intent.event === 'expense' ? -periodAmountKopecks : periodAmountKopecks;
  const scenarioProjectedKopecks =
    base.projected === null ? null : base.projected + signedChangeKopecks;
  const scenarioAvailableKopecks =
    base.available === null ? null : base.available + signedChangeKopecks;
  return {
    occurrences,
    periodAmountKopecks,
    yearlyAmountKopecks: intent.frequency === 'monthly' ? intent.amountKopecks * 12 : null,
    signedChangeKopecks,
    baseProjectedKopecks: base.projected,
    scenarioProjectedKopecks,
    scenarioAvailableKopecks,
    freeNowKopecks:
      assumptions.currentBalanceKopecks === null || assumptions.futurePaymentsKopecks === null
        ? null
        : assumptions.currentBalanceKopecks - assumptions.futurePaymentsKopecks,
    days: base.days,
  };
}

export type ScenarioImpact = NonNullable<ReturnType<typeof calculateScenarioImpact>>;
export type ScenarioAiResponse = {
  mode: 'gigachat';
  intent: ScenarioIntent;
  impact: ScenarioImpact | null;
  explanation: ScenarioExplanation | null;
};
