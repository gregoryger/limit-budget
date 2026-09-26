import { useEffect, useState } from 'react';
import { ArrowUpRight, FlaskConical } from 'lucide-react';
import type { Assumptions } from '../../shared/budget-calculation';
import { calculateBudget } from '../../shared/budget-calculation';
import {
  parseScenarioQuestion,
  plannedExpenseSchema,
  decideScenario,
  simulate,
  simulatePlannedExpense,
  type PlannedExpense,
  type ScenarioDecision,
} from '../../shared/scenarios';
import { daysBetween } from '../../shared/budget-calculation';
import { parseMoney, rub, type Transaction } from '../../shared/transactions';
import { ProjectionChart } from './Charts';
import { api, json } from './api';

type Props = { transactions: Transaction[]; assumptions: Assumptions; transferMode: boolean; importId: string };

function nextDay(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

export function Scenarios({ transactions, assumptions, transferMode, importId }: Props) {
  return transferMode ? (
    <TransferScenario transactions={transactions} assumptions={assumptions} />
  ) : (
    <WhatIfScenario transactions={transactions} assumptions={assumptions} importId={importId} />
  );
}

function TransferScenario({ transactions, assumptions }: Pick<Props, 'transactions' | 'assumptions'>) {
  const [daily, setDaily] = useState(assumptions.dailySpendKopecks);
  const [transfer, setTransfer] = useState(0);
  const [recipient, setRecipient] = useState('');
  const base = calculateBudget(transactions, assumptions);
  const result = simulate(transactions, assumptions, daily, transfer);
  const maxTransfer = 100_000_000_00 - (assumptions.futurePaymentsKopecks ?? 0);
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">ПЛАНИРУЙТЕ СПОКОЙНО</p>
          <h1>Переводы без сюрпризов</h1>
          <p className="muted">
            Проверьте, как расход повлияет на остаток. Деньги никуда не отправляются.
          </p>
        </div>
        <FlaskConical className="heading-icon" size={34} />
      </div>
      <div className="notice">
        Симулятор · только расчёт.{' '}
        {result.complete
          ? 'Результат меняется сразу.'
          : 'Сначала укажите остаток и обязательные платежи в «Обзоре».'}
      </div>
      <div className="scenario-grid">
        <section className="glass">
          <span className="tag">ЧТО, ЕСЛИ</span>
          <h2>Перевести другу</h2>
          <label>
            Кому (необязательно)
            <input
              placeholder="Например, Саше за ужин"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </label>
          <label>
            Разовый расход / перевод, ₽
            <input
              aria-label="Сумма перевода"
              type="number"
              min="0"
              max={maxTransfer / 100}
              step="0.01"
              value={transfer / 100}
              onChange={(e) => setTransfer(Math.min(parseMoney(e.target.value) ?? 0, maxTransfer))}
            />
          </label>
          <DailySpend daily={daily} assumptions={assumptions} onChange={setDaily} />
          <p className="muted small">
            Разовый расход добавляется к будущим обязательствам. Исходная выписка сохраняется.
          </p>
          <button
            className="secondary"
            onClick={() => {
              setDaily(assumptions.dailySpendKopecks);
              setTransfer(0);
            }}
          >
            Сбросить сценарий
          </button>
        </section>
        <section className="glass">
          <p className="eyebrow">ОСТАНЕТСЯ К КОНЦУ ПЕРИОДА</p>
          <div
            className={`large-number ${result.projected !== null && result.projected < 0 ? 'negative' : ''}`}
          >
            {result.projected === null ? 'Недостаточно данных' : rub(result.projected)}
          </div>
          <p className="muted">
            {result.projected !== null && base.projected !== null
              ? `Изменение относительно плана: ${rub(result.projected - base.projected)}`
              : 'Заполните допущения на экране обзора.'}
          </p>
          <ProjectionChart budget={result} />
        </section>
      </div>
      <div className="glass scenario-note">
        <ArrowUpRight />
        <p>
          {result.projected === null
            ? 'Проверить сценарий можно после ввода данных.'
            : result.projected >= 0
              ? 'При этих допущениях денег хватит. Учитывайте, что поступления могут задержаться.'
              : 'При этих допущениях образуется дефицит. Попробуйте уменьшить ежедневные траты или разовый расход.'}
        </p>
      </div>
    </>
  );
}

function DailySpend({
  daily,
  assumptions,
  onChange,
}: {
  daily: number;
  assumptions: Assumptions;
  onChange: (value: number) => void;
}) {
  const maxRubles = Math.max(3000, assumptions.dailySpendKopecks / 100);
  return (
    <>
      <label>
        Траты в день <strong className="range-value">{rub(daily)}</strong>
        <input
          aria-label="Сценарий ежедневных трат"
          type="range"
          min="0"
          max={maxRubles}
          step="1"
          value={daily / 100}
          onChange={(e) => onChange(Number(e.target.value) * 100)}
        />
      </label>
      <div className="chart-labels">
        <span>0 ₽</span>
        <span>{rub(maxRubles * 100)}</span>
      </div>
    </>
  );
}

function WhatIfScenario({ transactions, assumptions, importId }: Omit<Props, 'transferMode'>) {
  const [question, setQuestion] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [description, setDescription] = useState('Планируемый расход');
  const [amountText, setAmountText] = useState('0');
  const [frequency, setFrequency] = useState<PlannedExpense['frequency']>('once');
  const [firstPaymentDate, setFirstPaymentDate] = useState(nextDay(assumptions.asOf));
  const [modelExplanation, setModelExplanation] = useState('');
  const [explanationMode, setExplanationMode] = useState<'gigachat' | 'local'>('local');
  const amountKopecks = parseMoney(amountText);
  const expense = plannedExpenseSchema.safeParse({
    description,
    amountKopecks,
    frequency,
    firstPaymentDate,
  });
  const comparison =
    expense.success && firstPaymentDate > assumptions.asOf
      ? simulatePlannedExpense(transactions, assumptions, expense.data)
      : null;
  const decision = comparison ? decideScenario(transactions, comparison) : null;
  const base = calculateBudget(transactions, assumptions);
  const budget = comparison?.budget ?? base;
  const scenarioKey = comparison ? JSON.stringify({ expense: comparison.expense, assumptions }) : '';

  useEffect(() => {
    setModelExplanation('');
    setExplanationMode('local');
    if (!scenarioKey) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api<{ explanation: string; explanationMode: 'gigachat' | 'local' }>(
        '/api/scenario',
        json({ importId, assumptions, expense: JSON.parse(scenarioKey).expense }),
      )
        .then((result) => {
          if (!cancelled) {
            setModelExplanation(result.explanation);
            setExplanationMode(result.explanationMode);
          }
        })
        .catch(() => {
          if (!cancelled) setModelExplanation('Серверное объяснение недоступно; показан локальный расчёт.');
        });
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scenarioKey, importId]);

  function interpret(value: string) {
    setQuestion(value);
    const parsed = parseScenarioQuestion(value);
    if (!parsed.ok) {
      setQuestionError(parsed.message);
      return;
    }
    setQuestionError('');
    setDescription(parsed.expense.description);
    setAmountText(String(parsed.expense.amountKopecks / 100));
    setFrequency(parsed.expense.frequency);
    setFirstPaymentDate(nextDay(assumptions.asOf));
  }

  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">ПЛАНИРУЙТЕ СПОКОЙНО</p>
          <h1>Что будет, если…</h1>
          <p className="muted">
            Проверьте покупку или аренду на своём бюджете. Расчёт не меняет выписку.
          </p>
        </div>
        <FlaskConical className="heading-icon" size={34} />
      </div>
      <div className="notice">
        Симулятор · только расчёт.{' '}
        {base.complete
          ? 'Результат меняется сразу после изменения суммы и условий.'
          : 'Для прогноза укажите остаток и обязательные платежи в «Обзоре».'}
      </div>
      <div className="scenario-grid">
        <section className="glass">
          <span className="tag">ЧТО, ЕСЛИ</span>
          <h2>Задайте вопрос</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              interpret(question);
            }}
          >
            <label>
              Вопрос о покупке или аренде
              <input
                aria-label="Вопрос для симулятора"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Что будет, если куплю телефон за 50 000 ₽?"
              />
            </label>
            <button className="secondary scenario-submit" type="submit">
              Рассчитать
            </button>
          </form>
          <div className="scenario-examples">
            <button
              className="text-link"
              type="button"
              onClick={() => interpret('Куплю телефон за 50 000 ₽')}
            >
              Телефон за 50 000 ₽
            </button>
            <button
              className="text-link"
              type="button"
              onClick={() => interpret('Сниму квартиру за 25 000 ₽')}
            >
              Квартира за 25 000 ₽/мес.
            </button>
          </div>
          {questionError && (
            <p className="error" role="alert">
              {questionError}
            </p>
          )}
          <h2>Условия сценария</h2>
          <label>
            Что планируете
            <input
              aria-label="Описание расхода"
              value={description}
              maxLength={100}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="scenario-fields">
            <label>
              Сумма одного платежа, ₽
              <input
                aria-label="Сумма сценария"
                type="number"
                min="0.01"
                max="100000000"
                step="0.01"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
              />
            </label>
            <label>
              Периодичность
              <select
                aria-label="Периодичность расхода"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as PlannedExpense['frequency'])}
              >
                <option value="once">Один раз</option>
                <option value="monthly">Каждый месяц</option>
              </select>
            </label>
          </div>
          <label>
            Первый платёж
            <input
              aria-label="Дата первого платежа"
              type="date"
              min={nextDay(assumptions.asOf)}
              value={firstPaymentDate}
              onChange={(e) => setFirstPaymentDate(e.target.value)}
            />
          </label>
          {amountText !== '0' && (!expense.success || firstPaymentDate <= assumptions.asOf) && (
            <p className="error" role="alert">
              Проверьте описание, сумму и дату первого платежа. Дата должна быть позже даты остатка.
            </p>
          )}
          <p className="muted small">
            Новый расход добавляется к платежам исходного плана. Если он уже включён в
            обязательства, скорректируйте их в «Обзоре».
          </p>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setQuestion('');
              setQuestionError('');
              setDescription('Планируемый расход');
              setAmountText('0');
              setFrequency('once');
              setFirstPaymentDate(nextDay(assumptions.asOf));
            }}
          >
            Сбросить сценарий
          </button>
        </section>
        <section className="glass">
          <p className="eyebrow">РЕШЕНИЕ ПО ПОКУПКЕ</p>
          <h2 className="scenario-verdict" aria-live="polite">
            {!decision
              ? 'Укажите желаемую трату'
              : decision.recommendation === 'buy_now'
                ? firstPaymentDate === nextDay(assumptions.asOf) ? 'Купить сейчас' : 'Оплатить в указанную дату'
                : decision.recommendation === 'wait'
                  ? `Подождать примерно ${daysBetween(assumptions.asOf, decision.waitUntil!)} дн.`
                  : decision.recommendation === 'cut_spending'
                    ? 'Купить, если сократить расходы'
                    : 'Пока рано решать'}
          </h2>
          {!decision && <p className="muted small">Заполните условия слева — вывод появится сразу.</p>}
          {decision && (
            <div className="scenario-options" aria-label="Варианты решения">
              <div className={decision.recommendation === 'buy_now' ? 'selected' : ''}>
                <strong>Купить сейчас</strong>
                <span>{decision.recommendation === 'buy_now' ? 'Укладывается в прогноз' : 'Сейчас создаёт дефицит или данных недостаточно'}</span>
              </div>
              <div className={decision.recommendation === 'wait' ? 'selected' : ''}>
                <strong>Купить позже</strong>
                <span>{decision.recommendation === 'buy_now' ? 'Ожидание не требуется' : decision.waitUntil ? `Ориентир — ${decision.waitUntil}, через ${daysBetween(assumptions.asOf, decision.waitUntil)} дн. от даты остатка. Оценка по прошлым операциям.` : 'Срок пока нельзя оценить по истории'}</span>
              </div>
              <div className={decision.recommendation === 'cut_spending' ? 'selected' : ''}>
                <strong>Купить и сократить траты</strong>
                <span>{decision.recommendation === 'buy_now' ? 'Сокращение не требуется' : decision.cutCategory && decision.dailyCutKopecks ? `Например, «${decision.cutCategory}»: экономить ${rub(decision.dailyCutKopecks)} в день до ${assumptions.endDate}` : 'В этом периоде не хватает сокращения доступных повседневных расходов'}</span>
              </div>
            </div>
          )}
          {decision && <p className="muted small scenario-ai"><strong>{explanationMode === 'gigachat' ? 'Объяснение GigaChat' : 'Локальный расчёт (без ИИ)'}</strong><br />{modelExplanation || decision.reason}</p>}
          <p className="eyebrow">ОСТАНЕТСЯ К КОНЦУ ПЕРИОДА</p>
          <div
            className={`large-number ${budget.projected !== null && budget.projected < 0 ? 'negative' : ''}`}
          >
            {budget.projected === null ? 'Недостаточно данных' : rub(budget.projected)}
          </div>
          {comparison ? (
            <div className="scenario-breakdown" aria-live="polite">
              <div>
                <span>Без сценария</span>
                <strong>{base.projected === null ? '—' : rub(base.projected)}</strong>
              </div>
              <div>
                <span>Платежей до {assumptions.endDate}</span>
                <strong>{comparison.paymentDates.length}</strong>
              </div>
              <div>
                <span>Стоимость сценария</span>
                <strong>{rub(comparison.totalCostKopecks)}</strong>
              </div>
              <div>
                <span>Изменение прогноза</span>
                <strong>
                  {comparison.projectedChangeKopecks === null
                    ? '—'
                    : rub(comparison.projectedChangeKopecks)}
                </strong>
              </div>
              <div>
                <span>Лимит в день после расхода</span>
                <strong>
                  {budget.dailyLimit === null
                    ? '—'
                    : budget.dailyLimit < 0
                      ? 'нет'
                      : rub(budget.dailyLimit)}
                </strong>
              </div>
              {comparison.shortfallKopecks !== null && comparison.shortfallKopecks > 0 && (
                <div className="negative">
                  <span>Дефицит к концу периода</span>
                  <strong>{rub(comparison.shortfallKopecks)}</strong>
                </div>
              )}
              <p className="small muted">
                {comparison.paymentDates.length
                  ? `${comparison.expense.frequency === 'monthly' ? 'Платежи' : 'Платёж'}: ${comparison.paymentDates.join(', ')}.`
                  : 'Первый платёж вне выбранного периода; на этот прогноз он не влияет.'}
              </p>
            </div>
          ) : (
            <p className="muted small">Введите желаемую трату, сумму и дату первого платежа.</p>
          )}
          <ProjectionChart budget={budget} />
        </section>
      </div>
      <div className="glass scenario-note">
        <ArrowUpRight />
        <p>
          {budget.projected === null
            ? 'Точный прогноз появится после ввода остатка и обязательных платежей. Стоимость сценария можно проверить уже сейчас.'
            : budget.projected < 0
              ? `При этих допущениях к ${assumptions.endDate} не хватит ${rub(-budget.projected)}. Измените сумму, дату платежа или повседневные траты.`
              : `При этих допущениях к ${assumptions.endDate} денег хватит. Даты остальных поступлений и платежей неизвестны: внутри периода возможен кассовый разрыв.`}
        </p>
      </div>
    </>
  );
}
