import { rub } from '../../shared/transactions';
import type { Budget } from '../../shared/budget-calculation';
const colors = ['#ffdd2d', '#a6b7b0', '#9e8dcb', '#669fbc', '#d58f6f', '#879280', '#b9babc'];
export function CategoryChart({ budget }: { budget: Budget }) {
  const entries = Object.entries(budget.byCategory).sort((a, b) => b[1] - a[1]);
  let cursor = 0;
  const slices = entries.map(([, v], i) => {
    const start = cursor;
    cursor += budget.expenses ? (v / budget.expenses) * 100 : 0;
    return `${colors[i % colors.length]} ${start}% ${cursor}%`;
  });
  return (
    <section className="glass category-panel">
      <div className="section-heading">
        <h2>Куда уходят деньги</h2>
        <span className="muted small">По выписке</span>
      </div>
      <div className="category-layout">
        <div
          className="donut"
          role="img"
          aria-label={`Расходы ${rub(budget.expenses)}`}
          style={{ background: budget.expenses ? `conic-gradient(${slices.join(',')})` : '#333' }}
        >
          <div>
            <span className="muted small">Всего расходов</span>
            <strong>{rub(budget.expenses)}</strong>
          </div>
        </div>
        <div className="legend">
          {entries.map(([key, val], i) => (
            <div key={key}>
              <span className="dot" style={{ background: colors[i % colors.length] }} />
              <span>{key}</span>
              <b>{rub(val)}</b>
            </div>
          ))}
          {!entries.length && <p className="muted">Расходов в импорте нет.</p>}
        </div>
      </div>
    </section>
  );
}
export function ProjectionChart({ budget }: { budget: Budget }) {
  if (budget.projected === null || budget.available === null)
    return (
      <div className="chart-empty">
        <div className="empty-bars">
          {[35, 55, 43, 72, 60, 90, 78, 110, 97, 127].map((h, i) => (
            <i key={i} style={{ height: h }} />
          ))}
        </div>
        <p>
          Добавьте остаток и обязательные платежи,
          <br />
          чтобы увидеть прогноз
        </p>
      </div>
    );
  const start = budget.available,
    end = budget.projected;
  const max = Math.max(start, end, 1),
    min = Math.min(start, end, 0);
  const y = (v: number) => 155 - ((v - min) / (max - min)) * 115;
  return (
    <div className="projection">
      <div className="chart-numbers">
        <span>{rub(start)}</span>
        <span className={end < 0 ? 'negative' : 'positive'}>{rub(end)}</span>
      </div>
      <svg
        viewBox="0 0 600 185"
        role="img"
        aria-label={`Прогноз: ${rub(start)} после обязательств, ${rub(end)} на конец периода`}
      >
        <defs>
          <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffdd2d" stopOpacity=".24" />
            <stop offset="100%" stopColor="#ffdd2d" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[40, 80, 120, 160].map((y) => (
          <line key={y} x1="8" x2="592" y1={y} y2={y} stroke="#ffffff0e" />
        ))}
        <line x1="8" x2="592" y1={y(0)} y2={y(0)} stroke="#ffffff40" strokeDasharray="4 6" />
        <path d={`M 10 ${y(start)} L 590 ${y(end)} L 590 180 L 10 180 Z`} fill="url(#fade)" />
        <path d={`M 10 ${y(start)} L 590 ${y(end)}`} stroke="#ffdd2d" strokeWidth="3" fill="none" />
        <circle cx="590" cy={y(end)} r="5" fill="#ffdd2d" />
      </svg>
      <div className="chart-labels">
        <span>{budget.assumptions.asOf}</span>
        <span>{budget.days} дней · равномерные траты</span>
        <span>{budget.assumptions.endDate}</span>
      </div>
      <p className="small muted">
        Обязательные платежи и ожидаемые поступления учтены в начальной точке. График не
        предсказывает даты зачислений.
      </p>
    </div>
  );
}
