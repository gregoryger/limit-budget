import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { extractStatement, InputError } from './statement-import/parser.js';
import { anonymizeBankTablePdf } from './statement-import/anonymize-bank-table.js';
import { validateModelResponse } from './transactions/validate.js';
import { demoResponse } from './gigachat/demo-response.js';
import { explainBudget, extractWithGigaChat, isConfigured } from './gigachat/adapter.js';
import { answerAdvisor } from './gigachat/advisor.js';
import { explainScenarioWithGigaChat, interpretScenarioWithGigaChat } from './gigachat/adapter.js';
import { advisorRequestSchema } from '../shared/advisor.js';
import { calculateScenarioImpact, scenarioQuestionSchema } from '../shared/scenario-ai.js';
import { rub } from '../shared/transactions.js';
import { createShowcaseData } from '../shared/showcase.js';
import { assumptionsSchema, calculateBudget } from '../shared/budget-calculation.js';
import { transactionSchema, type ImportResult, type Transaction } from '../shared/transactions.js';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fields: 2 },
});
type Session = { review: ImportResult; transactions?: Transaction[]; audit?: unknown[] };
const sessions = new Map<string, Session>();
const demoFile = () => readFile(path.resolve('public/demo-statement.csv'));
function purge() {
  for (const [id, s] of sessions) if (s.review.expiresAt < Date.now()) sessions.delete(id);
}
setInterval(purge, 60000).unref();
function getSession(id: string) {
  purge();
  const session = sessions.get(id);
  if (!session)
    throw new InputError('Импорт истёк или сервер перезапущен. Загрузите файл снова.', 404);
  return session;
}
export const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
// Local hackathon app: same-origin requests only, no permissive CORS.
app.use('/api', (req, _res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    try {
      const url = new URL(origin);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error();
    } catch {
      return next(new InputError('Недопустимый источник запроса.', 403));
    }
  }
  next();
});
// Confirmation includes one decision per PDF line and has no application size cap.
app.use('/api/import/:id/confirm', express.json({ limit: Infinity }));
app.use(express.json({ limit: '300kb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, gigachatConfigured: isConfigured() }));
app.post('/api/scenario-ai', async (req, res) => {
  const payload = scenarioQuestionSchema.parse(req.body);
  if (!isConfigured())
    throw new InputError('Для разбора вопроса настройте GigaChat в серверном .env.', 503);
  const transactions = payload.importId
    ? getSession(payload.importId).transactions
    : createShowcaseData(new Date(`${payload.assumptions.asOf}T12:00:00`)).transactions;
  if (!transactions) throw new InputError('Сначала подтвердите импорт.', 400);
  try {
    const intent = await interpretScenarioWithGigaChat(payload.question);
    const impact = calculateScenarioImpact(transactions, payload.assumptions, intent);
    if (!impact) return res.json({ mode: 'gigachat', intent, impact: null, explanation: null });
    const explanation = await explainScenarioWithGigaChat({
      question: payload.question,
      interpretation: {
        event: intent.event,
        label: intent.label,
        frequency: intent.frequency,
        uncertain: intent.uncertain,
        amount: rub(intent.amountKopecks!),
      },
      calculations: {
        periodDays: impact.days,
        occurrences: impact.occurrences,
        amountForPeriod: rub(impact.periodAmountKopecks),
        annualAmount: impact.yearlyAmountKopecks === null ? null : rub(impact.yearlyAmountKopecks),
        changeFromPlan: rub(impact.signedChangeKopecks),
        baseProjected:
          impact.baseProjectedKopecks === null ? null : rub(impact.baseProjectedKopecks),
        conditionalProjected:
          impact.scenarioProjectedKopecks === null ? null : rub(impact.scenarioProjectedKopecks),
        freeNow: impact.freeNowKopecks === null ? null : rub(impact.freeNowKopecks),
      },
      source: payload.importId ? 'подтверждённая выписка' : 'вымышленные демонстрационные данные',
    });
    res.json({ mode: 'gigachat', intent, impact, explanation });
  } catch {
    throw new InputError('GigaChat не смог разобрать вопрос. Повторите попытку.', 502);
  }
});
app.post('/api/advisor', async (req, res) => {
  const payload = advisorRequestSchema.parse(req.body);
  if (!isConfigured())
    throw new InputError(
      'GigaChat ещё не подключён. Добавьте GIGACHAT_AUTH_KEY в серверный .env.',
      503,
    );
  const transactions = payload.importId
    ? getSession(payload.importId).transactions
    : createShowcaseData(new Date(`${payload.assumptions.asOf}T12:00:00`)).transactions;
  if (!transactions) throw new InputError('Сначала подтвердите импорт.', 400);
  if (
    payload.scenario &&
    payload.assumptions.futurePaymentsKopecks !== null &&
    payload.scenario.amountKopecks + payload.assumptions.futurePaymentsKopecks > 100_000_000_00
  )
    throw new InputError('Сумма сценария слишком велика.', 400);
  try {
    const answer = await answerAdvisor(payload, transactions, !payload.importId);
    res.json({ ...answer, mode: 'gigachat' });
  } catch {
    throw new InputError('GigaChat сейчас не ответил. Расчёты на экране остаются доступными.', 502);
  }
});
app.post('/api/anonymize', upload.single('file'), async (req, res) => {
  if (!req.file) throw new InputError('Выберите PDF.');
  if (!req.file.originalname.toLowerCase().endsWith('.pdf'))
    throw new InputError('Для обезличивания нужен PDF.');
  if (!['application/pdf', 'application/octet-stream'].includes(req.file.mimetype))
    throw new InputError('Неверный тип PDF.');
  const result = await anonymizeBankTablePdf(req.file.buffer);
  res.json({ filename: 'budget-anonymized.csv', ...result });
});
app.post('/api/import', upload.single('file'), async (req, res) => {
  if (req.body.safeData !== 'true')
    throw new InputError('Подтвердите, что файл синтетический или обезличенный.');
  const demoRequested = req.body.demo === 'true';
  if (!demoRequested && !req.file) throw new InputError('Выберите выписку.');
  const buffer = demoRequested ? await demoFile() : req.file!.buffer;
  const filename = demoRequested ? 'demo-statement.csv' : path.basename(req.file!.originalname);
  const rows = await extractStatement(
    buffer,
    filename,
    demoRequested ? 'text/csv' : req.file!.mimetype,
  );
  const demoRows = await extractStatement(await demoFile(), 'demo-statement.csv', 'text/csv');
  const isFixture = JSON.stringify(rows) === JSON.stringify(demoRows);
  let mode: ImportResult['mode'] = 'gigachat';
  let result: unknown;
  let notice = 'Распознано GigaChat. Проверьте каждую строку перед импортом.';
  if (demoRequested || !isConfigured()) {
    if (!isFixture)
      throw new InputError(
        'Ключ GigaChat не настроен. Для своей обезличенной выписки настройте сервер; сейчас доступна кнопка «Попробовать демо».',
        503,
      );
    mode = 'demo';
    result = demoResponse;
    notice = 'Демо: заранее подготовленный ответ для синтетической выписки. GigaChat не вызывался.';
  } else {
    try {
      result = await extractWithGigaChat(rows);
    } catch {
      if (!isFixture)
        throw new InputError(
          'GigaChat недоступен или вернул некорректный JSON. Файл не импортирован. Повторите позже или попробуйте демо.',
          502,
        );
      mode = 'demo';
      result = demoResponse;
      notice =
        'GigaChat недоступен: для демо-выписки использован заранее подготовленный ответ, а не результат модели.';
    }
  }
  let reviewRows;
  try {
    reviewRows = validateModelResponse(result, rows);
  } catch {
    throw new InputError(
      'Ответ модели не прошёл проверку происхождения строк. Импорт остановлен; можно попробовать демо.',
      502,
    );
  }
  purge();
  if (sessions.size >= 100)
    throw new InputError('Достигнут лимит активных импортов. Повторите позже.', 429);
  const review: ImportResult = {
    id: randomUUID(),
    filename,
    mode,
    notice,
    rows: reviewRows,
    expiresAt: Date.now() + 30 * 60 * 1000,
  };
  sessions.set(review.id, { review });
  res.json(review);
});
const confirmationSchema = z
  .object({
    decisions: z.array(
      z
        .object({
          sourceId: z.string(),
          include: z.boolean(),
          transaction: transactionSchema.nullable(),
          reviewed: z.boolean(),
          reason: z.string().max(500),
        })
        .strict(),
    ),
  })
  .strict();
app.post('/api/import/:id/confirm', (req, res) => {
  const session = getSession(String(req.params.id));
  const { decisions } = confirmationSchema.parse(req.body);
  if (
    decisions.length !== session.review.rows.length ||
    new Set(decisions.map((d) => d.sourceId)).size !== decisions.length
  )
    throw new InputError('Нужно решить судьбу каждой исходной строки ровно один раз.');
  const confirmed: Transaction[] = [];
  const audit: unknown[] = [];
  const decisionBySource = new Map(decisions.map((d) => [d.sourceId, d]));
  for (const row of session.review.rows) {
    const d = decisionBySource.get(row.source.id);
    if (!d) throw new InputError('В подтверждении отсутствует исходная строка.');
    if (!d.include) {
      if (!d.reason.trim()) throw new InputError('Укажите причину исключения строки.');
      audit.push({ source: row.source, action: 'excluded', reason: d.reason });
      continue;
    }
    if (!d.transaction || d.transaction.sourceId !== row.source.id)
      throw new InputError('Операция должна ссылаться на свою исходную строку.');
    if (d.transaction.description !== row.source.description && row.source.description !== null)
      throw new InputError('Описание должно сохранять текст источника.');
    const corrected =
      !row.transaction || JSON.stringify(d.transaction) !== JSON.stringify(row.transaction);
    if ((row.issues.length || corrected) && (!d.reviewed || !d.reason.trim()))
      throw new InputError(
        'Для исправленной или сомнительной строки нужны отметка проверки и пояснение.',
      );
    confirmed.push(d.transaction);
    audit.push({
      source: row.source,
      action: corrected ? 'corrected' : 'accepted',
      transaction: d.transaction,
      reason: d.reason,
    });
  }
  if (!confirmed.length)
    throw new InputError('Вы исключили все строки. Для анализа нужна хотя бы одна операция.');
  session.transactions = confirmed;
  session.audit = audit;
  res.json({ transactions: confirmed, audit });
});
app.post('/api/budget', async (req, res) => {
  const payload = z
    .object({ importId: z.string(), assumptions: assumptionsSchema })
    .strict()
    .parse(req.body);
  const session = getSession(payload.importId);
  if (!session.transactions) throw new InputError('Сначала подтвердите импорт.');
  const budget = calculateBudget(session.transactions, payload.assumptions);
  const local = budget.complete
    ? 'Расчёт выполнен приложением. Прогноз учитывает указанный остаток, будущие поступления, обязательные платежи и ежедневные траты. Вероятные подписки нужно проверить и учесть в будущих платежах вручную.'
    : 'Для прогноза укажите текущий остаток и сумму обязательных платежей до конца периода. Если платежей нет, введите 0.';
  let explanation = local;
  let explanationMode: 'gigachat' | 'local' = 'local';
  if (session.review.mode === 'gigachat')
    try {
      explanation = await explainBudget(budget);
      explanationMode = 'gigachat';
    } catch {
      explanation = `${local} Объяснение GigaChat сейчас недоступно.`;
    }
  res.json({ budget, explanation, explanationMode });
});
app.delete('/api/import/:id', (req, res) => {
  sessions.delete(String(req.params.id));
  res.status(204).end();
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Маршрут не найден.' }));
app.use(express.static(path.resolve('dist')));
app.get('/', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof multer.MulterError)
      return res.status(400).json({
        error:
          error.code === 'LIMIT_FILE_SIZE'
            ? 'Не удалось загрузить файл целиком.'
            : 'Некорректная загрузка файла.',
      });
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: 'Проверьте поля: корректные даты, категории и неотрицательные суммы в копейках.',
      });
    if (error instanceof InputError) return res.status(error.status).json({ error: error.message });
    // Never log request bodies, statements, tokens, or upstream errors.
    res.status(500).json({ error: 'Не удалось обработать запрос. Повторите попытку.' });
  },
);
