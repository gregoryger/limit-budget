import { useState } from 'react';
import {
  calculateFreeMoney,
  obligationBreakdownSchema,
  obligationCategories,
  totalObligations,
  unallocatedObligations,
  type ObligationBreakdown,
  type ObligationCategory,
} from '../../shared/free-money';
import { parseMoney, rub } from '../../shared/transactions';

type Props = {
  currentBalanceKopecks: number | null;
  futurePaymentsKopecks: number | null;
  breakdown: ObligationBreakdown | null;
  endDate: string;
  busy: boolean;
  onSave: (value: ObligationBreakdown) => void;
};

function initialDraft(breakdown: ObligationBreakdown | null, total: number | null) {
  const values = breakdown ?? unallocatedObligations(total);
  return Object.fromEntries(
    obligationCategories.map(({ key }) => [key, values === null ? '' : String(values[key] / 100)]),
  ) as Record<ObligationCategory, string>;
}

export function FreeMoney({
  currentBalanceKopecks,
  futurePaymentsKopecks,
  breakdown,
  endDate,
  busy,
  onSave,
}: Props) {
  const [draft, setDraft] = useState(() => initialDraft(breakdown, futurePaymentsKopecks));
  const [changed, setChanged] = useState(false);
  const [allocatingExisting, setAllocatingExisting] = useState(
    breakdown === null && futurePaymentsKopecks !== null,
  );
  const [error, setError] = useState('');
  const parsed = obligationBreakdownSchema.safeParse(
    Object.fromEntries(
      obligationCategories.map(({ key }) => {
        const text = draft[key].trim();
        return [
          key,
          text === '' || text.startsWith('-') ? (text === '' ? 0 : null) : parseMoney(text),
        ];
      }),
    ),
  );
  const preview =
    parsed.success && (changed || futurePaymentsKopecks !== null)
      ? calculateFreeMoney(currentBalanceKopecks, parsed.data)
      : null;
  const saved = calculateFreeMoney(
    currentBalanceKopecks,
    breakdown ?? unallocatedObligations(futurePaymentsKopecks),
  );
  const shown = changed ? preview : saved;

  return (
    <section className="glass free-money" aria-labelledby="free-money-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ДОСТУПНО СЕЙЧАС</p>
          <h2 id="free-money-title">Сколько у меня реально свободных денег?</h2>
          <p className="muted">
            Баланс минус платежи, которые предстоят до {endDate}. Будущие доходы не прибавляем.
          </p>
        </div>
        <span className="tag">{changed ? 'ПРЕДВАРИТЕЛЬНО' : 'ПОСЛЕ ОБЯЗАТЕЛЬСТВ'}</span>
      </div>
      <div className="free-money-layout">
        <div className="free-money-result" aria-live="polite">
          <span className="muted">Можно потратить после обязательных платежей</span>
          <strong>
            {shown?.freeKopecks === null || shown === null
              ? 'Нужны данные'
              : rub(shown.freeKopecks)}
          </strong>
          {shown?.deficitKopecks !== null &&
            shown?.deficitKopecks !== undefined &&
            shown.deficitKopecks > 0 && (
              <p className="negative">
                На обязательные платежи не хватает {rub(shown.deficitKopecks)}.
              </p>
            )}
          <div className="free-money-equation">
            <span>Баланс</span>
            <b>{currentBalanceKopecks === null ? '—' : rub(currentBalanceKopecks)}</b>
            <span>Зарезервировано</span>
            <b>
              {shown?.reservedKopecks === null || shown === null ? '—' : rub(shown.reservedKopecks)}
            </b>
          </div>
          <p className="muted small">
            Это сумма после указанных обязательств, но до повседневных покупок. Итоговый прогноз
            выше отдельно учитывает ежедневные траты.
          </p>
        </div>
        <form
          className="free-money-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!parsed.success) {
              setError(
                'Проверьте суммы: нужны неотрицательные значения, всего не более 100 млн ₽.',
              );
              return;
            }
            setError('');
            onSave(parsed.data);
          }}
        >
          <h3>Обязательные платежи до {endDate}</h3>
          <p className="muted small">
            Введите только будущие суммы. Уже оплаченные операции из выписки не вычитаются повторно.
            {breakdown === null && futurePaymentsKopecks !== null
              ? ' Ранее указанная общая сумма находится в «Других». При заполнении остальных статей она перераспределяется; измените «Другие» вручную, чтобы изменить общую сумму.'
              : ' Сумма этих статей заменит общую сумму обязательных платежей в прогнозе.'}
          </p>
          <div className="free-money-fields">
            {obligationCategories.map(({ key, label }) => (
              <label key={key}>
                {label}, ₽
                <input
                  aria-label={`Обязательный платёж: ${label}`}
                  type="number"
                  min="0"
                  max="100000000"
                  step="0.01"
                  placeholder="0"
                  value={draft[key]}
                  onChange={(event) => {
                    const nextText = event.target.value;
                    if (key === 'other') setAllocatingExisting(false);
                    setDraft((previous) => {
                      const next = { ...previous, [key]: nextText };
                      if (allocatingExisting && key !== 'other') {
                        const oldAmount = parseMoney(previous[key] || '0');
                        const newAmount = nextText.startsWith('-')
                          ? null
                          : parseMoney(nextText || '0');
                        const oldOther = parseMoney(previous.other || '0');
                        if (oldAmount !== null && newAmount !== null && oldOther !== null) {
                          next.other = String(
                            Math.max(0, oldOther - (newAmount - oldAmount)) / 100,
                          );
                        }
                      }
                      return next;
                    });
                    setChanged(true);
                  }}
                />
              </label>
            ))}
          </div>
          <div className="free-money-total">
            <span>Всего обязательств</span>
            <strong>
              {parsed.success ? rub(totalObligations(parsed.data)) : 'Проверьте суммы'}
            </strong>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy} type="submit">
            Сохранить платежи и обновить прогноз
          </button>
        </form>
      </div>
    </section>
  );
}
