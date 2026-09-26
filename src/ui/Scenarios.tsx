import { useState } from 'react';
import { ArrowUpRight, FlaskConical } from 'lucide-react';
import type { Assumptions } from '../../shared/budget-calculation';
import { calculateBudget } from '../../shared/budget-calculation';
import { simulate } from '../../shared/scenarios';
import { parseMoney, rub, type Transaction } from '../../shared/transactions';
import { ProjectionChart } from './Charts';
export function Scenarios({
  transactions,
  assumptions,
  transferMode,
}: {
  transactions: Transaction[];
  assumptions: Assumptions;
  transferMode: boolean;
}) {
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
          <h1>{transferMode ? 'Переводы без сюрпризов' : 'А если попробовать иначе?'}</h1>
          <p className="muted">
            {transferMode
              ? 'Проверьте, как расход повлияет на остаток. Деньги никуда не отправляются.'
              : 'Меняйте привычки на экране — и смотрите, что будет с бюджетом.'}
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
          <h2>{transferMode ? 'Перевести другу' : 'Изменить повседневные траты'}</h2>
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
