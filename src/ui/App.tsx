import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Bell,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CreditCard,
  Download,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Plus,
  ShieldCheck,
  Search,
  Sparkles,
  Target,
  Upload,
  Wallet,
} from 'lucide-react';
import { calculateBudget, type Assumptions, type Budget } from '../../shared/budget-calculation';
import { rub, type ImportResult, type Transaction } from '../../shared/transactions';
import { api, json, STATIC_DEMO } from './api';
import { Review } from './Review';
import { BudgetInputs } from './BudgetInputs';
import { CategoryChart, ProjectionChart } from './Charts';
import { Scenarios } from './Scenarios';
import { Accounts } from './Accounts';
import { activeSubscriptions, createShowcaseData } from '../../shared/showcase';
import { DemoOverview, ExpenseDetective, GoalPlanner, Subscriptions } from './Showcase';
import { GigaAdvisor, type AdvisorAction, type AdvisorExtras } from './GigaAdvisor';
import { useModalFocus } from './useModalFocus';
type Page = 'Обзор' | 'Карты и счета' | 'Переводы' | 'Сценарии' | 'Детектив' | 'Цели' | 'Подписки';
const nav = [
  { name: 'Обзор' as Page, icon: LayoutDashboard },
  { name: 'Сценарии' as Page, icon: FlaskConical },
  { name: 'Детектив' as Page, icon: Search },
  { name: 'Цели' as Page, icon: Target },
  { name: 'Подписки' as Page, icon: CreditCard },
  { name: 'Карты и счета' as Page, icon: Wallet },
  { name: 'Переводы' as Page, icon: ArrowUpRight },
];
const showcase = createShowcaseData();
function initialAssumptions(demo: boolean): Assumptions {
  const now = new Date();
  const asOf = demo
    ? '2026-09-25'
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const d = new Date(`${asOf}T00:00:00Z`);
  const endDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  return {
    asOf,
    endDate,
    currentBalanceKopecks: null,
    futurePaymentsKopecks: null,
    futureIncomeKopecks: 0,
    dailySpendKopecks: 60000,
  };
}
export function App() {
  const [page, setPage] = useState<Page>('Обзор');
  const mainRef = useRef<HTMLElement>(null);
  const previousPage = useRef(page);
  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    window.scrollTo({ top: 0, behavior: 'instant' });
    mainRef.current?.focus({ preventScroll: true });
    document
      .querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [page]);
  const [review, setReview] = useState<ImportResult | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  // Экран проверки выписки и результат импорта открываются с верха страницы, а не там,
  // где пользователь нажал кнопку внизу.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [review?.id, imported?.id]);
  const [transactions, setTransactions] = useState<Transaction[]>(showcase.transactions);
  const [audit, setAudit] = useState<unknown[]>([]);
  const [assumptions, setAssumptions] = useState<Assumptions>(showcase.assumptions);
  const [explanation, setExplanation] = useState(
    'Это показательный бюджет. Расчёт использует вымышленные операции и ваши допущения: остаток, будущий доход, обязательные платежи и ежедневные траты.',
  );
  const [showcaseMode, setShowcaseMode] = useState(true);
  const [explanationMode, setExplanationMode] = useState('local');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [safe, setSafe] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sanitizedCsv, setSanitizedCsv] = useState<string | null>(null);
  const [sanitizedSummary, setSanitizedSummary] = useState('');
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorAction, setAdvisorAction] = useState<AdvisorAction | null>(null);
  const advisorSequence = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadDialog = useRef<HTMLElement>(null);
  useModalFocus(uploadDialog, uploadOpen, () => {
    if (!busy) setUploadOpen(false);
  });
  const budget = calculateBudget(transactions, assumptions);
  const hasData = transactions.length > 0;
  function openAdvisor(extras: AdvisorExtras = {}) {
    setAdvisorOpen(true);
    setAdvisorAction({ id: ++advisorSequence.current, screen: page, extras });
  }
  async function startImport(demo: boolean) {
    if (!demo && (!file || !safe)) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('safeData', 'true');
      if (demo) form.set('demo', 'true');
      else form.set('file', file!);
      const result = await api<ImportResult>('/api/import', { method: 'POST', body: form });
      setReview(result);
      setUploadOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить выписку');
    } finally {
      setBusy(false);
    }
  }
  async function anonymizePdf() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      const result = await api<{
        filename: string;
        csv: string;
        operations: number;
        ambiguous: number;
      }>('/api/anonymize', { method: 'POST', body: form });
      setSanitizedCsv(result.csv);
      setSanitizedSummary(
        `Подготовлено ${result.operations} операций; неоднозначных строк: ${result.ambiguous}. Исходный PDF не отправлялся в GigaChat.`,
      );
      setFile(new File([result.csv], result.filename, { type: 'text/csv' }));
      setSafe(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось обезличить PDF');
    } finally {
      setBusy(false);
    }
  }
  function downloadSanitized() {
    if (!sanitizedCsv) return;
    const url = URL.createObjectURL(new Blob([sanitizedCsv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'budget-anonymized.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  async function compute(value: Assumptions, id = imported?.id) {
    if (showcaseMode && !id) {
      const result = calculateBudget(transactions, value);
      setAssumptions(result.assumptions);
      setExplanation(
        `При текущем плане после обязательных платежей и ежедневных трат останется ${result.projected === null ? 'неизвестная сумма' : rub(result.projected)}. Измените значения ниже и сравните сценарии.`,
      );
      return;
    }
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ budget: Budget; explanation: string; explanationMode: string }>(
        '/api/budget',
        json({ importId: id, assumptions: value }),
      );
      setAssumptions(result.budget.assumptions);
      setExplanation(result.explanation);
      setExplanationMode(result.explanationMode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка расчёта');
    } finally {
      setBusy(false);
    }
  }
  function confirmed(t: Transaction[], a: unknown[]) {
    const next = initialAssumptions(review!.mode === 'demo');
    setImported(review);
    setTransactions(t);
    setAudit(a);
    setShowcaseMode(false);
    setAssumptions(next);
    setReview(null);
    setPage('Обзор');
    void compute(next, review!.id);
  }
  async function clear() {
    const ids = [review?.id, imported?.id].filter(Boolean);
    setReview(null);
    setImported(null);
    setTransactions(showcase.transactions);
    setAudit([]);
    setExplanation(
      'Это показательный бюджет на вымышленных данных. Измените допущения и сравните сценарии.',
    );
    setAssumptions(showcase.assumptions);
    setShowcaseMode(true);
    setPage('Обзор');
    for (const id of ids) await api(`/api/import/${id}`, { method: 'DELETE' }).catch(() => {});
  }
  function downloadAudit() {
    const blob = new Blob(
      [JSON.stringify({ mode: imported?.mode, transactions, audit, budget }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'budget-audit.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="desktop">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div
        className="app-shell"
        inert={uploadOpen || undefined}
        aria-hidden={uploadOpen || undefined}
      >
        <a className="skip-link" href="#main-content">
          К содержимому
        </a>
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage('Обзор');
            }}
          >
            <span className="brand-mark">Т</span>
            <span>
              лимит<span className="brand-dot">.</span>
            </span>
          </a>
          <p className="sidebar-label">Личный бюджет</p>
          <nav aria-label="Разделы бюджета">
            {nav.map(({ name, icon: Icon }) => (
              <button
                key={name}
                disabled={busy || !!review}
                className={page === name ? 'nav-item active' : 'nav-item'}
                aria-label={name}
                aria-current={page === name ? 'page' : undefined}
                title={name}
                onClick={() => setPage(name)}
              >
                <Icon size={19} />
                <span>{name}</span>
                {page === name && <span className="active-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="student-card">
              <span className="small-spark">
                <Sparkles size={17} />
              </span>
              <strong>На твоей стороне</strong>
              <p>
                Учёба, подработка, планы.
                <br />
                Найдём баланс.
              </p>
              <span className="tag">Студенческий режим</span>
            </div>
            <button className="reset-button" disabled={busy} onClick={clear}>
              <LogOut size={17} />
              Вернуть демо
            </button>
            <p className="sidebar-foot">
              Демонстрационный стенд
              <br />
              Вымышленные данные
            </p>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumbs">
              Личный кабинет <ChevronRight size={13} />
              <span>{page}</span>
            </div>
            <div className="topbar-right">
              <span className="status-dot" />
              <span className="small">
                {showcaseMode
                  ? 'Демонстрация · вымышленные данные'
                  : imported?.mode === 'gigachat'
                    ? 'GigaChat подключён'
                    : imported
                      ? 'Демо-режим'
                      : 'Твой финансовый помощник'}
              </span>
              <span className="header-divider" />
              <span className="avatar">СТ</span>
            </div>
          </header>
          {showcaseMode && (
            <div className="demo-ribbon">
              <Sparkles size={13} /> Демо · вымышленные данные
            </div>
          )}
          <main id="main-content" ref={mainRef} tabIndex={-1}>
            {error && (
              <div className="error" role="alert">
                {error}
                <button aria-label="Закрыть ошибку" onClick={() => setError('')}>
                  ×
                </button>
              </div>
            )}
            {busy && (
              <div className="loading" role="status">
                <span className="spinner" />
                Обрабатываем данные… Большой PDF может потребовать несколько запросов к модели.
              </div>
            )}
            {review ? (
              <Review
                key={review.id}
                data={review}
                onConfirm={confirmed}
                onCancel={() => {
                  void api(`/api/import/${review.id}`, { method: 'DELETE' });
                  setReview(null);
                }}
              />
            ) : (
              <>
                {page === 'Обзор' && (
                  <>
                    <div className="section-heading main-heading">
                      <div>
                        <h1>
                          Деньги под контролем<span className="yellow">.</span>
                        </h1>
                        <p className="muted">Понимай свой бюджет. Живи в своём ритме.</p>
                      </div>
                      {!STATIC_DEMO && (
                        <div className="overview-actions">
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() => setUploadOpen(true)}
                          >
                            <Upload size={17} />
                            Загрузить выписку
                          </button>
                          {showcaseMode && (
                            <button
                              className="text-link demo-import-link"
                              disabled={busy}
                              onClick={() => startImport(true)}
                            >
                              Попробовать демо <ArrowRight size={15} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {!hasData ? (
                      <>
                        <section className="welcome-hero glass">
                          <div className="hero-copy">
                            <span className="pill">
                              <Sparkles size={14} /> AI-помощник по бюджету
                            </span>
                            <h2>
                              Хватит ли денег
                              <br />
                              до конца месяца?
                            </h2>
                            <p>
                              Стипендия, подработка и кофе между парами.
                              <br />
                              Соберём всё в понятный план — из твоей выписки.
                            </p>
                            <div className="hero-actions">
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() => startImport(true)}
                              >
                                Попробовать демо
                                <ArrowRight size={18} />
                              </button>
                              <a
                                className="text-link"
                                href={`${import.meta.env.BASE_URL}demo-statement.csv`}
                                download
                              >
                                <Download size={16} />
                                Пример CSV
                              </a>
                            </div>
                            <span className="small muted">
                              Синтетические данные · без ключа · около 2 минут
                            </span>
                          </div>
                          <div className="hero-visual" aria-hidden="true">
                            <div className="orbit orbit-one" />
                            <div className="orbit orbit-two" />
                            <div className="floating-chip">
                              <Sparkles size={18} />
                              <span>Твой бюджет понятнее</span>
                            </div>
                            <div className="hero-bank-card">
                              <div>
                                <b>Т</b>
                                <span>студент</span>
                              </div>
                              <span className="card-chip" />
                              <p>•••• &nbsp; •••• &nbsp; •••• &nbsp; 4242</p>
                              <footer>
                                <span>DEMO CARD</span>
                                <b>лимит.</b>
                              </footer>
                            </div>
                            <div className="balance-chip">
                              <span className="check-circle">
                                <Check size={18} />
                              </span>
                              <span>
                                Сначала проверка
                                <br />
                                <b>Потом — уверенность</b>
                              </span>
                            </div>
                          </div>
                        </section>
                        <div className="steps-grid">
                          {[
                            {
                              n: '01',
                              title: 'Загрузи выписку',
                              text: 'CSV или PDF с текстовым слоем. Только обезличенные данные.',
                              icon: Upload,
                            },
                            {
                              n: '02',
                              title: 'Проверь операции',
                              text: 'Каждая сумма рядом с источником. Исправь то, что требует внимания.',
                              icon: Check,
                            },
                            {
                              n: '03',
                              title: 'Посмотри вперёд',
                              text: 'Укажи остаток и платежи. Узнай, сколько можно тратить каждый день.',
                              icon: ChartNoAxesCombined,
                            },
                          ].map((s) => (
                            <article className="glass step-card" key={s.n}>
                              <div>
                                <s.icon size={22} />
                                <span>{s.n}</span>
                              </div>
                              <h3>{s.title}</h3>
                              <p>{s.text}</p>
                            </article>
                          ))}
                        </div>
                        <div className="privacy-line">
                          <ShieldCheck size={17} />
                          <span>
                            Не нужны пароли и банковский доступ. Переводы здесь — только симуляция.
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        {showcaseMode && (
                          <DemoOverview
                            assumptions={assumptions}
                            budget={budget}
                            onNavigate={setPage}
                            onAskAdvisor={() =>
                              openAdvisor({ question: 'Что самое важное в моём бюджете сейчас?' })
                            }
                          />
                        )}
                        {imported?.notice && (
                          <div className="notice compact">{imported.notice}</div>
                        )}
                        <div className="stats-grid">
                          <Stat
                            title="Текущий остаток"
                            value={
                              assumptions.currentBalanceKopecks === null
                                ? 'Нужно уточнить'
                                : rub(assumptions.currentBalanceKopecks)
                            }
                            sub="На конец указанного дня"
                            icon={<Wallet size={18} />}
                          />
                          <Stat
                            title={showcaseMode ? 'Доходы в демо-истории' : 'Доходы по выписке'}
                            value={rub(budget.income)}
                            sub="Стипендия, подработка и другое"
                            icon={<ArrowDownLeft size={18} />}
                            positive
                          />
                          <Stat
                            title={showcaseMode ? 'Расходы в демо-истории' : 'Расходы по выписке'}
                            value={rub(budget.expenses)}
                            sub={`${transactions.length} подтверждённых операций`}
                            icon={<ArrowUpRight size={18} />}
                          />
                        </div>
                        <div className="forecast-grid">
                          <section className="glass forecast-card" id="forecast">
                            <div className="section-heading">
                              <h2>
                                {showcaseMode ? `Через ${budget.days} дней` : 'До конца месяца'}
                              </h2>
                              <span className="tag">Прогноз</span>
                            </div>
                            <div className="forecast-answer">
                              {budget.projected === null
                                ? 'Давай уточним пару вещей'
                                : budget.projected >= 0
                                  ? 'Да, по твоему плану хватит'
                                  : 'По твоему плану денег не хватит'}
                              <span className="yellow"> ↗</span>
                            </div>
                            <p className="muted">
                              {budget.projected === null
                                ? 'Нужны текущий остаток и будущие обязательные платежи.'
                                : `К ${assumptions.endDate} останется ${rub(budget.projected)} при тратах ${rub(assumptions.dailySpendKopecks)} в день.`}
                            </p>
                            <ProjectionChart budget={budget} />
                          </section>
                          <section className="glass ai-card">
                            <span className="ai-symbol">
                              <Sparkles size={25} />
                            </span>
                            <span className="tag">
                              {explanationMode === 'gigachat'
                                ? 'Объяснение GigaChat'
                                : 'Пояснение приложения'}
                            </span>
                            <h2>Бюджет человеческим языком</h2>
                            <p>{explanation || 'Укажи допущения ниже, чтобы получить расчёт.'}</p>
                            <div className="daily-limit">
                              <span>Условный лимит в день</span>
                              <strong>
                                {budget.dailyLimit === null ? '—' : rub(budget.dailyLimit)}
                              </strong>
                            </div>
                            <button className="text-link" onClick={() => setPage('Сценарии')}>
                              Посмотреть «Что, если»
                              <ArrowRight size={17} />
                            </button>
                            <button
                              className="text-link"
                              onClick={() =>
                                openAdvisor({
                                  question: 'На что мне обратить внимание в этом бюджете?',
                                })
                              }
                            >
                              Спросить GigaChat <Sparkles size={16} />
                            </button>
                          </section>
                        </div>
                        <BudgetInputs
                          key={imported?.id ?? 'showcase'}
                          value={assumptions}
                          onSave={compute}
                          busy={busy}
                          demo={showcaseMode}
                        />
                        <div className="analysis-grid">
                          <CategoryChart budget={budget} />
                          <section className="glass">
                            <div className="section-heading">
                              <h2>Может повториться</h2>
                              <span className="tag">Гипотеза</span>
                            </div>
                            <p className="muted small">
                              По признакам в выписке. Не добавляем в будущие платежи автоматически.
                            </p>
                            {(showcaseMode
                              ? activeSubscriptions(transactions, assumptions.asOf)
                              : budget.recurring
                            ).map((t) => (
                              <div className="recurring-row" key={t.sourceId}>
                                <span className="recurring-icon">
                                  <CreditCard size={18} />
                                </span>
                                <div>
                                  <strong>{t.description}</strong>
                                  <span>{t.date} · вероятно регулярно</span>
                                </div>
                                <b>{rub(t.amountKopecks)}</b>
                              </div>
                            ))}
                            {!(
                              showcaseMode
                                ? activeSubscriptions(transactions, assumptions.asOf)
                                : budget.recurring
                            ).length && (
                              <p className="muted">Вероятных регулярных платежей не отмечено.</p>
                            )}
                          </section>
                        </div>
                        <details className="glass source-details demo-transactions">
                          <summary>
                            {showcaseMode
                              ? 'Посмотреть все вымышленные операции'
                              : `История операций · ${transactions.length}`}
                          </summary>
                          <Transactions transactions={transactions} onDownload={downloadAudit} />
                        </details>
                        {!showcaseMode && (
                          <details className="glass source-details">
                            <summary>Исходные строки, решения и допущения</summary>
                            <p className="small muted">
                              История операций — {transactions[0]?.date} …{' '}
                              {transactions.at(-1)?.date}. Прогноз — с дня после {assumptions.asOf}{' '}
                              до {assumptions.endDate}. Исторический доход не прибавляется к
                              текущему остатку. Прогноз не учитывает даты будущих поступлений и
                              платежей; остаток внутри периода может быть ниже.
                            </p>
                            <pre>{JSON.stringify({ assumptions, audit }, null, 2)}</pre>
                          </details>
                        )}
                      </>
                    )}
                  </>
                )}
                {page === 'Карты и счета' && (
                  <Accounts
                    assumptions={assumptions}
                    budget={budget}
                    hasData={hasData}
                    onEdit={() => (hasData ? setPage('Обзор') : setUploadOpen(true))}
                    onSimulate={() => setPage('Переводы')}
                  />
                )}
                {(page === 'Сценарии' || page === 'Переводы') &&
                  (hasData ? (
                    <Scenarios
                      key={page + imported?.id}
                      transactions={transactions}
                      assumptions={assumptions}
                      importId={imported?.id}
                      transferMode={page === 'Переводы'}
                      onAskAdvisor={openAdvisor}
                    />
                  ) : (
                    <section className="glass empty-state">
                      <FlaskConical size={44} />
                      <h1>Сначала — твой бюджет</h1>
                      <p className="muted">
                        Загрузи выписку и подтверди операции, чтобы проверить влияние новых
                        расходов.
                      </p>
                      <button className="primary" onClick={() => setPage('Обзор')}>
                        Перейти к загрузке
                        <ArrowRight size={18} />
                      </button>
                    </section>
                  ))}
                {page === 'Детектив' && (
                  <ExpenseDetective
                    transactions={transactions}
                    asOf={assumptions.asOf}
                    demo={showcaseMode}
                    onScenario={() => setPage('Сценарии')}
                    onAskAdvisor={openAdvisor}
                  />
                )}
                {page === 'Цели' && (
                  <GoalPlanner
                    key={imported?.id ?? 'showcase'}
                    assumptions={assumptions}
                    onAskAdvisor={openAdvisor}
                  />
                )}
                {page === 'Подписки' && (
                  <Subscriptions
                    key={imported?.id ?? 'showcase'}
                    transactions={transactions}
                    asOf={assumptions.asOf}
                    demo={showcaseMode}
                    onAskAdvisor={openAdvisor}
                  />
                )}
              </>
            )}
            <footer className="page-footer">
              <span>
                лимит. <span className="muted">Место для твоих планов</span>
              </span>
              <span>Т-Банк · концепт для хакатона</span>
            </footer>
          </main>
        </div>
      </div>
      <div className="outside-caption">Деньги — часть жизни. Не вся жизнь.</div>
      <div inert={uploadOpen || undefined} aria-hidden={uploadOpen || undefined}>
        <GigaAdvisor
          screen={page}
          assumptions={assumptions}
          importId={imported?.id}
          open={advisorOpen}
          onOpenChange={setAdvisorOpen}
          action={advisorAction}
        />
      </div>
      {uploadOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setUploadOpen(false);
          }}
        >
          <section
            ref={uploadDialog}
            tabIndex={-1}
            className="modal glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
          >
            <button
              className="close-button"
              aria-label="Закрыть загрузку"
              disabled={busy}
              onClick={() => setUploadOpen(false)}
            >
              ×
            </button>
            <span className="eyebrow">Шаг 1 из 2: выписка</span>
            <h2 id="upload-title">Начнём с твоих операций</h2>
            <p className="muted">
              CSV в UTF-8 — до 2 МБ. Для текстового PDF нет ограничения по размеру, страницам и
              числу строк. Сканированные PDF пока не поддерживаются.
            </p>
            <button className="dropzone" disabled={busy} onClick={() => fileInput.current?.click()}>
              <Upload size={30} />
              <strong>{file?.name ?? 'Выбрать файл'}</strong>
              <span>CSV до 2 МБ · текстовый PDF без лимита загрузки</span>
            </button>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".csv,.pdf"
              aria-label="Файл выписки"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f?.name.toLowerCase().endsWith('.csv') && f.size > 2 * 1024 * 1024) {
                  setError('Максимальный размер CSV — 2 МБ.');
                  return;
                }
                setError('');
                setFile(f ?? null);
                setSafe(false);
                setSanitizedCsv(null);
                setSanitizedSummary('');
              }}
            />
            {file?.name.toLowerCase().endsWith('.pdf') && (
              <div className="anonymize-option">
                <p className="small muted">
                  Если PDF содержит полные реквизиты, сначала обезличьте его локально. Для таблиц с
                  датой и суммой сервис создаст CSV без имён, номеров и исходных описаний.
                </p>
                <button className="secondary" disabled={busy} onClick={anonymizePdf}>
                  Обезличить PDF и подготовить CSV
                </button>
              </div>
            )}
            {sanitizedCsv && (
              <div className="notice">
                {sanitizedSummary} Даты и суммы сохранены. Проверьте CSV перед отправкой в GigaChat.
                <button className="text-link" onClick={downloadSanitized}>
                  Скачать обезличенный CSV
                </button>
              </div>
            )}
            <label className="check-label safety">
              <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} />
              Файл синтетический или обезличен: нет полных номеров карт, счетов и персональных
              данных.
            </label>
            <p className="small muted">
              При настроенном ключе текст отправляется в GigaChat. Файл не сохраняется на диск. Не
              загружайте пароли, SMS-коды и CVV.
            </p>
            <button
              className="primary full-width"
              disabled={!file || !safe || busy}
              onClick={() => startImport(false)}
            >
              {busy ? 'Распознаём…' : 'Загрузить и распознать'}
              <ArrowRight size={18} />
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-bottom">
              <a
                className="text-link"
                href={`${import.meta.env.BASE_URL}demo-statement.csv`}
                download
              >
                Скачать пример
              </a>
              <button className="text-link" disabled={busy} onClick={() => startImport(true)}>
                Попробовать демо
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Stat({
  title,
  value,
  sub,
  icon,
  positive = false,
}: {
  title: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  positive?: boolean;
}) {
  return (
    <section className="glass stat">
      <div>
        <span>{title}</span>
        <span className={positive ? 'positive' : ''}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{sub}</p>
    </section>
  );
}
function Transactions({
  transactions,
  onDownload,
}: {
  transactions: Transaction[];
  onDownload: () => void;
}) {
  return (
    <section className="glass transactions">
      <div className="section-heading">
        <div>
          <h2>Операции без загадок</h2>
          <p className="muted small">Только подтверждённые строки выписки</p>
        </div>
        <button className="secondary" onClick={onDownload}>
          <Download size={16} />
          Скачать расчёт
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Операция</th>
              <th>Дата</th>
              <th>Категория</th>
              <th className="right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {[...transactions].reverse().map((t) => (
              <tr key={t.sourceId}>
                <td>
                  <span
                    className={`transaction-icon ${t.direction === 'income' ? 'income-icon' : ''}`}
                  >
                    {t.direction === 'income' ? (
                      <ArrowDownLeft size={16} />
                    ) : (
                      <ArrowUpRight size={16} />
                    )}
                  </span>
                  {t.description}
                </td>
                <td className="muted">{t.date}</td>
                <td>
                  <span className="category-tag">{t.category}</span>
                </td>
                <td className={`right ${t.direction === 'income' ? 'positive' : ''}`}>
                  {t.direction === 'income' ? '+' : '−'}
                  {rub(t.amountKopecks)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
