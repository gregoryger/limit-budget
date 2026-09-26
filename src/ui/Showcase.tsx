import { lazy, Suspense, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Coffee,
  Compass,
  CreditCard,
  Search,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-react';
import type { Assumptions, Budget } from '../../shared/budget-calculation';
import {
  activeSubscriptions,
  demoObligations,
  monthsToGoal,
  spendingInsights,
} from '../../shared/showcase';
import { rub, type Transaction } from '../../shared/transactions';
import type { AdvisorExtras } from './GigaAdvisor';
const BudgetStory = lazy(() =>
  import('./motion/BudgetStory').then((module) => ({ default: module.BudgetStory })),
);

type Destination = 'Сценарии' | 'Детектив' | 'Цели' | 'Подписки';
const features: { title: string; description: string; page: Destination; icon: typeof Sparkles }[] =
  [
    {
      title: 'Что будет, если…',
      description: 'Проверь покупку или аренду до решения.',
      page: 'Сценарии',
      icon: Sparkles,
    },
    {
      title: 'Детектив расходов',
      description: 'Найди незаметные траты и изменение привычек.',
      page: 'Детектив',
      icon: Search,
    },
    {
      title: 'GPS до цели',
      description: 'Узнай срок накопления и сравни темпы.',
      page: 'Цели',
      icon: Compass,
    },
    {
      title: 'Антиподписка',
      description: 'Посмотри цену регулярных платежей за год.',
      page: 'Подписки',
      icon: CreditCard,
    },
  ];

export function DemoOverview({
  assumptions,
  budget,
  onNavigate,
  onAskAdvisor,
}: {
  assumptions: Assumptions;
  budget: Budget;
  onNavigate: (page: Destination) => void;
  onAskAdvisor: () => void;
}) {
  const balance = assumptions.currentBalanceKopecks ?? 0;
  const obligations = assumptions.futurePaymentsKopecks ?? 0;
  const adjustment =
    obligations - demoObligations.reduce((sum, item) => sum + item.amountKopecks, 0);
  return (
    <>
      <section className="showcase-hero glass">
        <div>
          <h2>
            Хватит ли денег
            <br />
            на твои планы?
          </h2>
          <p>
            Сначала обязательное. Потом — то, чего хочется. Проверь покупку и посмотри, что
            останется до конца периода.
          </p>
          {budget.projected !== null && (
            <a className="showcase-projection" href="#forecast">
              <span>По плану через {budget.days} дней</span>
              <strong className={budget.projected < 0 ? 'negative' : ''}>
                {rub(budget.projected)} <ArrowRight size={18} />
              </strong>
            </a>
          )}
          <button className="secondary" onClick={() => onNavigate('Сценарии')}>
            Проверить покупку <ArrowRight size={17} />
          </button>
          <button className="text-link showcase-ask" onClick={onAskAdvisor}>
            Спросить GigaChat <Sparkles size={16} />
          </button>
          <span className="showcase-badge">
            <Sparkles size={14} /> Интерактивное демо · вымышленные данные
          </span>
        </div>
        <div className="showcase-free">
          <Suspense
            fallback={
              <div className="story-fallback">
                <span>Свободно после обязательных платежей</span>
                <strong>{rub(balance - obligations)}</strong>
                <p>
                  {rub(balance)} − {rub(obligations)}
                </p>
              </div>
            }
          >
            <BudgetStory balance={balance} obligations={obligations} />
          </Suspense>
          <small>Без будущих доходов. Прогноз на {budget.days} дней — ниже.</small>
        </div>
      </section>
      <div className="feature-grid">
        {features.map(({ title, description, page, icon: Icon }) => (
          <button className="glass feature-card" key={page} onClick={() => onNavigate(page)}>
            <span className="feature-icon">
              <Icon size={20} />
            </span>
            <strong>{title}</strong>
            <span>{description}</span>
            <ArrowRight className="feature-arrow" size={17} />
          </button>
        ))}
      </div>
      <section className="glass obligation-panel">
        <div className="section-heading">
          <div>
            <h2>Обязательные платежи</h2>
          </div>
          <span className="tag">В плане</span>
        </div>
        <div className="obligation-grid">
          {demoObligations.map((item) => (
            <div key={item.name}>
              <span>{item.name}</span>
              <strong>{rub(item.amountKopecks)}</strong>
            </div>
          ))}
          {adjustment !== 0 && (
            <div>
              <span>Изменение вашего плана</span>
              <strong>{rub(adjustment)}</strong>
            </div>
          )}
        </div>
        <p className="muted small">
          В демо это пример планируемых платежей. Уже прошедшие покупки из истории повторно не
          вычитаются.
        </p>
      </section>
    </>
  );
}

export function ExpenseDetective({
  transactions,
  asOf,
  onScenario,
  onAskAdvisor,
  demo,
}: {
  transactions: Transaction[];
  asOf: string;
  onScenario: () => void;
  onAskAdvisor: (extras: AdvisorExtras) => void;
  demo: boolean;
}) {
  const insight = spendingInsights(transactions, asOf);
  const growth = insight.previousCafe
    ? Math.round((insight.currentCafe / insight.previousCafe - 1) * 100)
    : null;
  return (
    <div className="feature-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI-детектив расходов</p>
          <h1>Куда уходят деньги?</h1>
          <p className="muted">
            Подсказки по {demo ? 'вымышленным' : 'подтверждённым'} операциям за последние 30 дней.
            Нажми на сценарий, чтобы проверить последствия.
          </p>
        </div>
        <Search className="yellow" size={31} />
      </div>
      <div className="insight-grid">
        <section className="glass insight-card">
          <span className="feature-icon">
            <Coffee size={21} />
          </span>
          <span className="tag">Незаметные покупки</span>
          <strong>{rub(insight.smallTotal)}</strong>
          <p>
            {insight.small.length} покупок до 500 ₽. По одной они кажутся небольшими, вместе заметно
            влияют на бюджет.
          </p>
        </section>
        <section className="glass insight-card">
          <span className="feature-icon">
            <Wallet size={21} />
          </span>
          <span className="tag">Удобство</span>
          <strong>{rub(insight.convenienceTotal)}</strong>
          <p>Доставка и такси за 30 дней: {insight.convenience.length} операций.</p>
        </section>
        <section className="glass insight-card">
          <span className="feature-icon">
            <CalendarDays size={21} />
          </span>
          <span className="tag">Динамика кафе</span>
          <strong>{growth === null ? 'Нет базы' : `${growth > 0 ? '+' : ''}${growth}%`}</strong>
          <p>
            {rub(insight.previousCafe)} в предыдущие 30 дней → {rub(insight.currentCafe)} сейчас.
          </p>
        </section>
      </div>
      <section className="glass evidence-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Проверяемые наблюдения</p>
            <h2>Операции за выводами</h2>
          </div>
          <span className="tag">Демо</span>
        </div>
        <div className="evidence-list">
          {insight.convenience.map((item) => (
            <div key={item.sourceId}>
              <span>
                {item.description}
                <small>{item.date}</small>
              </span>
              <strong>{rub(item.amountKopecks)}</strong>
            </div>
          ))}
        </div>
        {insight.convenience.length === 0 && (
          <p className="muted">Доставки и такси в этом периоде не найдены.</p>
        )}
      </section>
      <section className="glass takeaway">
        <div>
          <h2>А если сократить их наполовину?</h2>
          <p>
            В этом примере освободится около {rub(Math.round(insight.convenienceTotal / 2))} за
            месяц. Это гипотеза, а не обещание экономии.
          </p>
        </div>
        <button className="primary" onClick={onScenario}>
          Открыть симулятор <ArrowRight size={17} />
        </button>
        <button
          className="secondary"
          onClick={() =>
            onAskAdvisor({ question: 'Как сократить незаметные траты без жёстких ограничений?' })
          }
        >
          Совет GigaChat <Sparkles size={16} />
        </button>
      </section>
    </div>
  );
}

export function GoalPlanner({
  assumptions,
  onAskAdvisor,
}: {
  assumptions: Assumptions;
  onAskAdvisor: (extras: AdvisorExtras) => void;
}) {
  const defaultMonthly = Math.max(
    0,
    assumptions.futureIncomeKopecks -
      (assumptions.futurePaymentsKopecks ?? 0) -
      assumptions.dailySpendKopecks * 30,
  );
  const [target, setTarget] = useState(100_000);
  const [saved, setSaved] = useState(0);
  const [monthly, setMonthly] = useState(Math.round(defaultMonthly / 100));
  const months = monthsToGoal(target * 100, saved * 100, monthly * 100);
  const date =
    months === null
      ? null
      : new Date(new Date().getFullYear(), new Date().getMonth() + months, 1).toLocaleDateString(
          'ru-RU',
          { month: 'long', year: 'numeric' },
        );
  const variants = [0.65, 1, 1.4].map((factor) => ({
    monthly: Math.round(monthly * factor),
    months: monthsToGoal(target * 100, saved * 100, Math.round(monthly * factor) * 100),
  }));
  return (
    <div className="feature-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Финансовый GPS</p>
          <h1>Путь к цели</h1>
          <p className="muted">
            Задай сумму и темп накопления. Мы покажем срок и альтернативные маршруты.
          </p>
        </div>
        <Target className="yellow" size={34} />
      </div>
      <div className="goal-layout">
        <section className="glass goal-form">
          <span className="tag">Настрой маршрут</span>
          <h2>Например, ноутбук</h2>
          <label>
            Стоимость цели, ₽
            <input
              type="number"
              min="1"
              value={target}
              onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label>
            Уже накоплено, ₽
            <input
              type="number"
              min="0"
              value={saved}
              onChange={(e) => setSaved(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <label>
            Откладывать в месяц, ₽
            <input
              type="number"
              min="0"
              value={monthly}
              onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <p className="muted small">
            Стартовый темп рассчитан из примерного месячного дохода после обязательных платежей и
            повседневных трат. Его можно изменить.
          </p>
        </section>
        <section className="glass goal-result">
          <span className="eyebrow">Прогноз достижения</span>
          <strong>
            {months === null
              ? 'Задай сумму накопления'
              : months === 0
                ? 'Цель уже достигнута'
                : `${months} мес.`}
          </strong>
          <p>{date ? `Ориентир: ${date}` : 'При нулевом взносе срок не рассчитывается.'}</p>
          <div className="free-meter">
            <span style={{ width: `${Math.min(100, (saved / target) * 100)}%` }} />
          </div>
          <small>
            Уже есть {rub(saved * 100)} из {rub(target * 100)}
          </small>
          <p className="muted small">
            Расчёт без процентов и инфляции. Срок изменится, если доходы или расходы будут другими.
          </p>
          <button
            className="secondary goal-ask"
            onClick={() =>
              onAskAdvisor({
                question: 'Как мне реалистично дойти до этой цели?',
                goal: {
                  targetKopecks: target * 100,
                  savedKopecks: saved * 100,
                  monthlyKopecks: monthly * 100,
                },
              })
            }
          >
            Обсудить с GigaChat <Sparkles size={16} />
          </button>
        </section>
      </div>
      <div className="route-grid">
        {variants.map((item, index) => (
          <section className="glass route-card" key={index}>
            <span>{['Спокойный темп', 'Текущий план', 'Быстрее к цели'][index]}</span>
            <strong>{rub(item.monthly * 100)} / мес.</strong>
            <p>
              {item.months === null
                ? 'Срок не определён'
                : item.months === 0
                  ? 'Цель достигнута'
                  : `${item.months} мес. до цели`}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}

export function Subscriptions({
  transactions,
  asOf,
  demo,
  onAskAdvisor,
}: {
  transactions: Transaction[];
  asOf: string;
  demo: boolean;
  onAskAdvisor: (extras: AdvisorExtras) => void;
}) {
  const items = activeSubscriptions(transactions, asOf);
  const [paused, setPaused] = useState<string[]>([]);
  const total = items.reduce((sum, item) => sum + item.amountKopecks, 0);
  const saving = items
    .filter((item) => paused.includes(item.sourceId))
    .reduce((sum, item) => sum + item.amountKopecks, 0);
  return (
    <div className="feature-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Антиподписка</p>
          <h1>Регулярные платежи под контролем</h1>
          <p className="muted">
            Найденные {demo ? 'в демонстрационной истории' : 'в истории операций'} подписки. Отметь
            те, которыми можно не пользоваться, и посмотри эффект.
          </p>
        </div>
        <CreditCard className="yellow" size={32} />
      </div>
      <div className="subscription-summary">
        <section className="glass">
          <span>За месяц</span>
          <strong>{rub(total)}</strong>
        </section>
        <section className="glass">
          <span>За год</span>
          <strong>{rub(total * 12)}</strong>
        </section>
        <section className="glass accent">
          <span>Возможная экономия</span>
          <strong>{rub(saving * 12)} / год</strong>
        </section>
      </div>
      <section className="glass subscription-list">
        <div className="section-heading">
          <h2>Что повторяется</h2>
          <span className="tag">Симуляция отключения</span>
        </div>
        {items.map((item) => (
          <label className="subscription-row" key={item.sourceId}>
            <span>
              <strong>{item.description}</strong>
              <small>Последнее списание {item.date}</small>
            </span>
            <b>{rub(item.amountKopecks)} / мес.</b>
            <span className="subscription-toggle">
              <input
                type="checkbox"
                checked={paused.includes(item.sourceId)}
                onChange={(e) =>
                  setPaused((current) =>
                    e.target.checked
                      ? [...current, item.sourceId]
                      : current.filter((id) => id !== item.sourceId),
                  )
                }
              />{' '}
              Убрать из плана
            </span>
          </label>
        ))}
        {items.length === 0 && (
          <p className="muted">Регулярных списаний за последние 30 дней не найдено.</p>
        )}
      </section>
      <p className="muted small">
        Отметка меняет только расчёт на экране. Реальные подписки в банке или сервисах не
        отключаются.
      </p>
      <button
        className="secondary"
        onClick={() =>
          onAskAdvisor({
            question: 'Какие подписки стоит пересмотреть и как это повлияет на бюджет?',
            pausedSubscriptionIds: paused,
          })
        }
      >
        Обсудить подписки с GigaChat <Sparkles size={16} />
      </button>
    </div>
  );
}
