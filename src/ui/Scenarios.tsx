import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FlaskConical } from 'lucide-react';
import type { Assumptions } from '../../shared/budget-calculation';
import { calculateBudget } from '../../shared/budget-calculation';
import { simulate } from '../../shared/scenarios';
import type { ScenarioAiResponse } from '../../shared/scenario-ai';
import { parseMoney, rub, type Transaction } from '../../shared/transactions';
import { ProjectionChart } from './Charts';
import type { AdvisorExtras } from './GigaAdvisor';
import { api, json } from './api';
export function Scenarios({
  transactions,
  assumptions,
  importId,
  transferMode,
  onAskAdvisor,
}: {
  transactions: Transaction[];
  assumptions: Assumptions;
  importId?: string;
  transferMode: boolean;
  onAskAdvisor: (extras: AdvisorExtras) => void;
}) {
  const [daily, setDaily] = useState(assumptions.dailySpendKopecks);
  const [transfer, setTransfer] = useState(0);
  const [recipient, setRecipient] = useState('');
  const [question, setQuestion] = useState('Что будет, если куплю телефон за 50 000 ₽?');
  const [analysis, setAnalysis] = useState<ScenarioAiResponse | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const requestSequence = useRef(0);
  useEffect(() => {
    requestSequence.current++;
    setAnalysis(null);
    setQuestionLoading(false);
  }, [
    importId,
    assumptions.asOf,
    assumptions.endDate,
    assumptions.currentBalanceKopecks,
    assumptions.futurePaymentsKopecks,
    assumptions.futureIncomeKopecks,
    assumptions.dailySpendKopecks,
  ]);
  const base = calculateBudget(transactions, assumptions);
  const result = simulate(transactions, assumptions, daily, transfer);
  const impact = analysis?.impact;
  const shownResult = impact
    ? {
        ...base,
        available: impact.scenarioAvailableKopecks,
        projected: impact.scenarioProjectedKopecks,
      }
    : result;
  const maxTransfer = 100_000_000_00 - (assumptions.futurePaymentsKopecks ?? 0);
  async function applyQuestion(text: string) {
    if (!text.trim()) return;
    const requestId = ++requestSequence.current;
    setQuestionLoading(true);
    setQuestionError('');
    setAnalysis(null);
    try {
      const response = await api<ScenarioAiResponse>(
        '/api/scenario-ai',
        json({ question: text.trim(), assumptions, ...(importId ? { importId } : {}) }),
      );
      if (requestId === requestSequence.current) setAnalysis(response);
    } catch (error) {
      if (requestId === requestSequence.current)
        setQuestionError(
          error instanceof Error ? error.message : 'Не удалось получить ответ GigaChat.',
        );
    } finally {
      if (requestId === requestSequence.current) setQuestionLoading(false);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">ПЛАНИРУЙТЕ СПОКОЙНО</p>
          <h1>{transferMode ? 'Переводы без сюрпризов' : 'Что будет, если…'}</h1>
          <p className="muted">
            {transferMode
              ? 'Проверьте, как расход повлияет на остаток. Деньги никуда не отправляются.'
              : 'Спросите своими словами. GigaChat поймёт событие и объяснит, как оно изменит бюджет.'}
          </p>
        </div>
        <FlaskConical className="heading-icon" size={34} />
      </div>
      <div className="notice">
        Сценарий · не реальная операция.{' '}
        {result.complete
          ? 'Суммы считает приложение, смысл вопроса и последствия объясняет GigaChat.'
          : 'Сначала укажите остаток и обязательные платежи в «Обзоре».'}
      </div>
      {!transferMode && (
        <section className="glass question-panel">
          <span className="eyebrow">СПРОСИ ПРО СВОЁ РЕШЕНИЕ</span>
          <h2>Что будет, если…</h2>
          <form
            className="question-form"
            onSubmit={(event) => {
              event.preventDefault();
              void applyQuestion(question);
            }}
          >
            <input
              aria-label="Вопрос о сценарии"
              maxLength={500}
              value={question}
              onChange={(e) => {
                requestSequence.current++;
                setQuestion(e.target.value);
                setAnalysis(null);
                setQuestionLoading(false);
              }}
            />
            <button
              className="primary"
              type="submit"
              disabled={questionLoading || !question.trim()}
            >
              {questionLoading ? 'Анализируем…' : 'Спросить GigaChat'}
            </button>
          </form>
          <div className="question-presets">
            {[
              'Куплю телефон за 50 000 ₽',
              'Сниму квартиру за 25 000 ₽ в месяц',
              'Что будет, если выиграю в казино 500 000 ₽?',
            ].map((preset) => (
              <button
                key={preset}
                className="secondary"
                onClick={() => {
                  setQuestion(preset);
                  void applyQuestion(preset);
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          {questionError && (
            <p className="error" role="alert">
              {questionError}
            </p>
          )}
          {questionLoading && (
            <p className="muted small" role="status">
              GigaChat разбирает вопрос и проверяет расчёты…
            </p>
          )}
          {analysis && (
            <div className="scenario-ai-answer" aria-live="polite">
              <p className="question-feedback">
                GigaChat понял: {analysis.intent.label}
                {analysis.intent.amountKopecks !== null &&
                  ` · ${rub(analysis.intent.amountKopecks)}`}
                {' · '}
                {analysis.intent.event === 'income'
                  ? 'поступление'
                  : analysis.intent.event === 'saving'
                    ? 'экономия'
                    : analysis.intent.event === 'expense'
                      ? 'расход'
                      : 'нужно уточнение'}
                {' · '}
                {analysis.intent.frequency === 'monthly'
                  ? 'каждый месяц'
                  : analysis.intent.frequency === 'daily'
                    ? 'каждый день'
                    : 'один раз'}
                .
              </p>
              {analysis.explanation ? (
                <>
                  <h3>Ответ GigaChat</h3>
                  <p>{analysis.explanation.summary}</p>
                  <ul>
                    {analysis.explanation.keyPoints.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                  <p>
                    <strong>Что сделать:</strong> {analysis.explanation.nextStep}
                  </p>
                  <p className="muted small">{analysis.explanation.followUp}</p>
                </>
              ) : (
                <p>{analysis.intent.clarification || 'Уточните сумму и повторите вопрос.'}</p>
              )}
            </div>
          )}
          {!analysis && !questionLoading && !questionError && (
            <p className="muted small">
              Можно описать покупку, новый доход, регулярный платёж или условный выигрыш. Для ответа
              нужен подключённый GigaChat.
            </p>
          )}
        </section>
      )}
      <div className="scenario-grid">
        <section className="glass">
          <span className="tag">ЧТО, ЕСЛИ</span>
          <h2>
            {transferMode
              ? 'Перевести другу'
              : impact
                ? 'Как поняли сценарий'
                : 'Настрой детали сценария'}
          </h2>
          {impact && analysis ? (
            <div className="scenario-ai-facts">
              <p>
                <strong>{analysis.intent.label}</strong>
              </p>
              <p>
                {analysis.intent.event === 'income'
                  ? 'Поступление'
                  : analysis.intent.event === 'saving'
                    ? 'Сокращение расхода'
                    : 'Расход'}
                : {rub(analysis.intent.amountKopecks ?? 0)}{' '}
                {analysis.intent.frequency === 'monthly'
                  ? 'в месяц'
                  : analysis.intent.frequency === 'daily'
                    ? 'в день'
                    : 'один раз'}
              </p>
              <p>
                За период учтено: {impact.occurrences}{' '}
                {impact.occurrences === 1 ? 'событие' : 'событий'},{' '}
                {rub(impact.periodAmountKopecks)}.
              </p>
              {impact.yearlyAmountKopecks !== null && (
                <p>За 12 месяцев при таком условии: {rub(impact.yearlyAmountKopecks)}.</p>
              )}
              {analysis.intent.uncertain && (
                <p className="muted">
                  Это условный вариант. Базовый прогноз без события:{' '}
                  {impact.baseProjectedKopecks === null
                    ? 'недостаточно данных'
                    : rub(impact.baseProjectedKopecks)}
                  .
                </p>
              )}
              {analysis.intent.event === 'saving' && (
                <p className="muted">
                  Экономия получится, только если этот расход уже включён в текущий план.
                </p>
              )}
              <button className="secondary" onClick={() => setAnalysis(null)}>
                Настроить вручную
              </button>
            </div>
          ) : (
            <>
              {transferMode && (
                <label>
                  Кому (необязательно)
                  <input
                    placeholder="Например, Саше за ужин"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                </label>
              )}
              <label>
                {transferMode ? 'Сумма перевода, ₽' : 'Разовый расход, ₽'}
                <input
                  aria-label={transferMode ? 'Сумма перевода' : 'Стоимость сценария'}
                  type="number"
                  min="0"
                  max={maxTransfer / 100}
                  step="0.01"
                  value={transfer / 100}
                  onChange={(e) =>
                    setTransfer(Math.min(parseMoney(e.target.value) ?? 0, maxTransfer))
                  }
                />
              </label>
              <label>
                Траты в день <strong className="range-value">{rub(daily)}</strong>
                <input
                  aria-label="Сценарий ежедневных трат"
                  type="range"
                  min="0"
                  max={Math.max(3000, assumptions.dailySpendKopecks / 100)}
                  step="1"
                  value={daily / 100}
                  onChange={(e) => setDaily(Number(e.target.value) * 100)}
                />
              </label>
              <div className="chart-labels">
                <span>0 ₽</span>
                <span>{rub(Math.max(300000, assumptions.dailySpendKopecks))}</span>
              </div>
              <p className="muted small">
                Ручной расчёт: расход добавляется к будущим обязательствам. Исходные операции
                сохраняются.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  setDaily(assumptions.dailySpendKopecks);
                  setTransfer(0);
                  setAnalysis(null);
                  setQuestionError('');
                }}
              >
                Сбросить сценарий
              </button>
            </>
          )}
        </section>
        <section className="glass">
          <p className="eyebrow">ОСТАНЕТСЯ К КОНЦУ ПЕРИОДА</p>
          <div
            className={`large-number ${shownResult.projected !== null && shownResult.projected < 0 ? 'negative' : ''}`}
          >
            {shownResult.projected === null ? 'Недостаточно данных' : rub(shownResult.projected)}
          </div>
          <p className="muted">
            {shownResult.projected !== null && base.projected !== null
              ? `Изменение относительно плана: ${rub(shownResult.projected - base.projected)}`
              : 'Заполните допущения на экране обзора.'}
          </p>
          {analysis?.intent.uncertain && impact ? (
            <div className="scenario-branches">
              <div>
                <span>Без события</span>
                <strong>
                  {impact.baseProjectedKopecks === null
                    ? 'Недостаточно данных'
                    : rub(impact.baseProjectedKopecks)}
                </strong>
              </div>
              <div>
                <span>Если произойдёт</span>
                <strong>
                  {impact.scenarioProjectedKopecks === null
                    ? 'Недостаточно данных'
                    : rub(impact.scenarioProjectedKopecks)}
                </strong>
              </div>
            </div>
          ) : (
            <ProjectionChart budget={shownResult} />
          )}
        </section>
      </div>
      <div className="glass scenario-note">
        <ArrowUpRight />
        <p>
          {shownResult.projected === null
            ? 'Проверить сценарий можно после ввода данных.'
            : analysis?.intent.uncertain
              ? 'Это условный сценарий: событие может не произойти. Сравните результат с базовым прогнозом.'
              : shownResult.projected >= 0
                ? 'При этих допущениях денег хватит. Учитывайте, что поступления могут задержаться.'
                : 'При этих допущениях образуется дефицит. Попробуйте уменьшить ежедневные траты или разовый расход.'}
        </p>
      </div>
      {!analysis && (
        <button
          className="secondary scenario-ask"
          onClick={() =>
            onAskAdvisor({
              question: transferMode
                ? 'Как этот перевод повлияет на мой план?'
                : 'Что можно улучшить в этом сценарии?',
              scenario: {
                amountKopecks: transfer,
                dailySpendKopecks: daily,
                recurring: false,
              },
            })
          }
        >
          Разобрать с GigaChat
        </button>
      )}
    </>
  );
}
