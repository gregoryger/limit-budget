import { useState } from 'react';
import { assumptionsSchema, type Assumptions } from '../../shared/budget-calculation';
import { parseMoney } from '../../shared/transactions';
export function BudgetInputs({
  value,
  onSave,
  busy,
}: {
  value: Assumptions;
  onSave: (a: Assumptions) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const money = (
    key:
      | 'currentBalanceKopecks'
      | 'futurePaymentsKopecks'
      | 'futureIncomeKopecks'
      | 'dailySpendKopecks',
    text: string,
  ) => setDraft((d) => ({ ...d, [key]: text === '' ? null : parseMoney(text) }));
  return (
    <form
      className="glass assumptions"
      onSubmit={(e) => {
        e.preventDefault();
        const result = assumptionsSchema.safeParse(draft);
        if (!result.success) {
          setError('Проверьте суммы и период: максимум 366 дней.');
          return;
        }
        setError('');
        onSave(result.data);
      }}
    >
      <div className="section-heading">
        <div>
          <h2>Из чего складывается прогноз</h2>
          <p className="muted">
            Остаток — на конец выбранного дня. Уже прошедшие операции повторно не вычитаются.
          </p>
        </div>
        <span className="tag">ВАШИ ДАННЫЕ</span>
      </div>
      <div className="fields three">
        <label>
          Остаток на счетах, ₽
          <input
            aria-label="Текущий остаток"
            type="number"
            min="0"
            step="0.01"
            placeholder="Укажите текущий остаток"
            value={draft.currentBalanceKopecks === null ? '' : draft.currentBalanceKopecks / 100}
            onChange={(e) => money('currentBalanceKopecks', e.target.value)}
          />
        </label>
        <label>
          Будущие обязательные платежи, ₽
          <input
            aria-label="Обязательные платежи"
            type="number"
            min="0"
            step="0.01"
            placeholder="Укажите сумму или 0"
            value={draft.futurePaymentsKopecks === null ? '' : draft.futurePaymentsKopecks / 100}
            onChange={(e) => money('futurePaymentsKopecks', e.target.value)}
          />
        </label>
        <label>
          Ожидаемые поступления, ₽
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={draft.futureIncomeKopecks === null ? '' : draft.futureIncomeKopecks / 100}
            onChange={(e) => money('futureIncomeKopecks', e.target.value)}
          />
        </label>
        <label>
          Остаток на дату
          <input
            aria-label="Дата остатка"
            type="date"
            value={draft.asOf}
            onChange={(e) => setDraft({ ...draft, asOf: e.target.value })}
          />
        </label>
        <label>
          Конец периода
          <input
            type="date"
            value={draft.endDate}
            onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
          />
        </label>
        <label>
          Повседневные траты в день, ₽
          <input
            aria-label="Ежедневные траты"
            type="number"
            min="0"
            step="0.01"
            required
            value={draft.dailySpendKopecks === null ? '' : draft.dailySpendKopecks / 100}
            onChange={(e) => money('dailySpendKopecks', e.target.value)}
          />
        </label>
      </div>
      <p className="small muted">
        Включите аренду, подписки и другие платежи до конца периода. Ежедневные траты указывайте без
        этих платежей. Будущие доходы — ваше допущение, а не гарантия.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? 'Считаем и объясняем…' : 'Рассчитать прогноз'}
      </button>
    </form>
  );
}
