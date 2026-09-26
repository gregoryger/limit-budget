import { useState } from 'react';
import { AlertTriangle, Check, ChevronRight } from 'lucide-react';
import {
  categories,
  parseMoney,
  transactionSchema,
  type ImportResult,
  type Transaction,
} from '../../shared/transactions';
import { api, json } from './api';
type Decision = {
  sourceId: string;
  include: boolean;
  transaction: Transaction | null;
  reviewed: boolean;
  reason: string;
};
export function Review({
  data,
  onConfirm,
  onCancel,
}: {
  data: ImportResult;
  onConfirm: (t: Transaction[], audit: unknown[]) => void;
  onCancel: () => void;
}) {
  const [decisions, setDecisions] = useState<Decision[]>(
    data.rows.map((r) => ({
      sourceId: r.source.id,
      include: !!r.transaction,
      transaction: r.transaction ?? {
        sourceId: r.source.id,
        date: r.source.date ?? '',
        description: r.source.description ?? r.source.raw,
        amountKopecks: r.source.amountKopecks ?? 0,
        direction: r.source.direction ?? 'expense',
        category: 'Другое',
        recurring: false,
        suspicious: true,
        note: r.issues.join('; '),
      },
      reviewed: false,
      reason: '',
    })),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const pageCount = Math.ceil(data.rows.length / pageSize);
  const unresolved = decisions.filter((d) => !d.include && !d.reason.trim()).length;
  const pageRows = data.rows.slice(page * pageSize, (page + 1) * pageSize);
  const update = (i: number, p: Partial<Decision>) =>
    setDecisions((v) => v.map((d, j) => (i === j ? { ...d, ...p } : d)));
  const edit = (i: number, p: Partial<Transaction>) => {
    const d = decisions[i];
    update(i, { transaction: { ...d.transaction!, ...p }, reviewed: false });
  };
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      for (const d of decisions) if (d.include) transactionSchema.parse(d.transaction);
      const result = await api<{ transactions: Transaction[]; audit: unknown[] }>(
        `/api/import/${data.id}/confirm`,
        json({ decisions }),
      );
      onConfirm(result.transactions, result.audit);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== 'ZodError'
          ? e.message
          : 'Проверьте даты и суммы включённых операций.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="review">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ШАГ 02 / ПРОВЕРКА</p>
          <h1>Всё ли верно?</h1>
          <p className="muted">
            Исходные строки рядом с операциями. Вы решаете, что попадёт в бюджет.
          </p>
        </div>
        <button className="secondary" onClick={onCancel}>
          Отменить
        </button>
      </div>
      <div className="notice">{data.notice}</div>
      <p className="muted">
        {data.filename} · {data.rows.length} строк ·{' '}
        {data.rows.filter((r) => r.issues.length).length} требуют внимания. Для исключения или
        исправления укажите причину. Данные хранятся в памяти 30 минут.
      </p>
      {data.rows.length > pageSize && (
        <div className="review-pagination">
          <button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Назад
          </button>
          <span>
            Страница {page + 1} из {pageCount}
          </span>
          <button
            className="secondary"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            Дальше
          </button>
        </div>
      )}
      {unresolved > 0 && (
        <button
          className="secondary"
          onClick={() =>
            setDecisions((current) =>
              current.map((d) =>
                !d.include && !d.reason.trim()
                  ? { ...d, reason: 'Не распознано; исключено после проверки исходной строки' }
                  : d,
              ),
            )
          }
        >
          Указать причину исключения для {unresolved} нераспознанных строк
        </button>
      )}
      <div className="review-list">
        {pageRows.map((row, offset) => {
          const i = page * pageSize + offset;
          const d = decisions[i],
            t = d.transaction!;
          const changed = JSON.stringify(t) !== JSON.stringify(row.transaction);
          return (
            <article
              className={`review-row ${row.issues.length ? 'attention' : ''}`}
              key={row.source.id}
            >
              <div className="source">
                <span className="eyebrow">СТРОКА {i + 1} · ИСТОЧНИК</span>
                <code>{row.source.raw}</code>
                {row.issues.map((issue) => (
                  <p className="warning-text" key={issue}>
                    <AlertTriangle size={14} />
                    {issue}
                  </p>
                ))}
              </div>
              <div className="recognized">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={(e) => update(i, { include: e.target.checked })}
                  />
                  Включить в импорт
                </label>
                {d.include && (
                  <>
                    <div className="fields four">
                      <label>
                        Дата
                        <input
                          aria-label={`Дата строки ${i + 1}`}
                          type="date"
                          value={t.date}
                          onChange={(e) => edit(i, { date: e.target.value })}
                        />
                      </label>
                      <label>
                        Сумма, ₽
                        <input
                          aria-label={`Сумма строки ${i + 1}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={Number.isNaN(t.amountKopecks) ? '' : t.amountKopecks / 100}
                          onChange={(e) =>
                            edit(i, { amountKopecks: parseMoney(e.target.value) ?? NaN })
                          }
                        />
                      </label>
                      <label>
                        Направление
                        <select
                          value={t.direction}
                          onChange={(e) =>
                            edit(i, { direction: e.target.value as Transaction['direction'] })
                          }
                        >
                          <option value="expense">Расход</option>
                          <option value="income">Доход</option>
                        </select>
                      </label>
                      <label>
                        Категория
                        <select
                          aria-label={`Категория строки ${i + 1}`}
                          value={t.category}
                          onChange={(e) =>
                            edit(i, { category: e.target.value as Transaction['category'] })
                          }
                        >
                          {categories.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={t.recurring}
                        onChange={(e) => edit(i, { recurring: e.target.checked })}
                      />
                      Вероятный регулярный платёж
                    </label>
                  </>
                )}
                {(!d.include || changed || row.issues.length > 0) && (
                  <div className="resolution">
                    <label>
                      {d.include ? 'Пояснение исправления' : 'Причина исключения'}
                      <input
                        aria-label={`Причина строки ${i + 1}`}
                        placeholder={
                          d.include
                            ? 'Сверил с исходной строкой'
                            : 'Например: направление неизвестно'
                        }
                        value={d.reason}
                        onChange={(e) => update(i, { reason: e.target.value })}
                      />
                    </label>
                    {d.include && (
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={d.reviewed}
                          onChange={(e) => update(i, { reviewed: e.target.checked })}
                        />
                        Я проверил эту операцию
                      </label>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {data.rows.length > pageSize && (
        <div className="review-pagination">
          <button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Назад
          </button>
          <span>
            Страница {page + 1} из {pageCount}
          </span>
          <button
            className="secondary"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            Дальше
          </button>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="review-footer">
        <span>
          <Check size={18} /> В расчёт попадут {decisions.filter((d) => d.include).length} операций
        </span>
        <button className="primary" disabled={busy} onClick={confirm}>
          {busy ? 'Подтверждаем…' : 'Подтвердить импорт'}
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}
