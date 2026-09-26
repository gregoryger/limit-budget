import { z } from 'zod';
import { assumptionsSchema } from './budget-calculation.js';
import { moneySchema } from './transactions.js';

export const advisorScreenSchema = z.enum([
  'Обзор',
  'Сценарии',
  'Детектив',
  'Цели',
  'Подписки',
  'Карты и счета',
  'Переводы',
]);

export const advisorRequestSchema = z
  .object({
    screen: advisorScreenSchema,
    importId: z.string().uuid().optional(),
    assumptions: assumptionsSchema,
    question: z.string().trim().min(1).max(500).optional(),
    history: z
      .array(
        z
          .object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(700) })
          .strict(),
      )
      .max(6)
      .default([]),
    scenario: z
      .object({
        amountKopecks: moneySchema,
        dailySpendKopecks: moneySchema,
        recurring: z.boolean(),
      })
      .strict()
      .optional(),
    goal: z
      .object({
        targetKopecks: moneySchema,
        savedKopecks: moneySchema,
        monthlyKopecks: moneySchema,
      })
      .strict()
      .optional(),
    pausedSubscriptionIds: z.array(z.string().max(100)).max(30).optional(),
  })
  .strict();

export const advisorResponseSchema = z
  .object({
    message: z.string().min(1).max(900),
    nextStep: z.string().min(1).max(300),
    followUp: z.string().min(1).max(180),
  })
  .strict();

export type AdvisorRequest = z.input<typeof advisorRequestSchema>;
export type AdvisorResponse = z.infer<typeof advisorResponseSchema>;
