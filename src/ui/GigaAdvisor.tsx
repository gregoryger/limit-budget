import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import type { AdvisorRequest, AdvisorResponse } from '../../shared/advisor';
import type { Assumptions } from '../../shared/budget-calculation';
import { api, json, STATIC_DEMO } from './api';

export type AdvisorExtras = Pick<
  AdvisorRequest,
  'question' | 'scenario' | 'goal' | 'pausedSubscriptionIds'
>;
export type AdvisorAction = { id: number; screen: AdvisorRequest['screen']; extras: AdvisorExtras };
type Message = { role: 'user' | 'assistant'; content: string };

export function GigaAdvisor({
  screen,
  assumptions,
  importId,
  open,
  onOpenChange,
  action,
}: {
  screen: AdvisorRequest['screen'];
  assumptions: Assumptions;
  importId?: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  action: AdvisorAction | null;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState<AdvisorResponse | null>(null);
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState<AdvisorExtras>({});
  const [conversation, setConversation] = useState<Message[]>([]);
  const sequence = useRef(0);

  useEffect(() => {
    let active = true;
    api<{ gigachatConfigured: boolean }>('/api/health')
      .then((health) => {
        if (active) setConfigured(health.gigachatConfigured);
      })
      .catch(() => {
        if (active) setConfigured(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function requestAdvice(extras: AdvisorExtras, history: Message[] = []) {
    if (!configured) return;
    const requestNumber = ++sequence.current;
    setLoading(true);
    setError('');
    setAnswer(null);
    if (extras.question)
      setConversation((current) =>
        [...current, { role: 'user' as const, content: extras.question! }].slice(-6),
      );
    const payload: AdvisorRequest = {
      screen,
      assumptions,
      ...(importId ? { importId } : {}),
      history: history.slice(-6),
      ...extras,
    };
    try {
      const response = await api<AdvisorResponse & { mode: 'gigachat' }>(
        '/api/advisor',
        json(payload),
      );
      if (requestNumber !== sequence.current) return;
      setAnswer(response);
      setConversation((current) =>
        [...current, { role: 'assistant' as const, content: response.message }].slice(-6),
      );
    } catch (failure) {
      if (requestNumber === sequence.current)
        setError(
          failure instanceof Error ? failure.message : 'Не удалось получить ответ GigaChat.',
        );
    } finally {
      if (requestNumber === sequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    sequence.current++;
    setAnswer(null);
    setError('');
    setContext({});
    setConversation([]);
    if (configured) void requestAdvice({});
  }, [screen, assumptions, importId, configured]);

  useEffect(() => {
    if (!action || action.screen !== screen) return;
    setContext(action.extras);
    if (configured) void requestAdvice(action.extras);
  }, [action?.id, configured]);

  function submitQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setQuestion('');
    void requestAdvice({ ...context, question: trimmed }, conversation);
  }

  return (
    <>
      <button
        className="advisor-launch"
        onClick={() => onOpenChange(!open)}
        aria-label="GigaChat помощник"
        aria-expanded={open}
        aria-controls="giga-advisor-panel"
      >
        <Sparkles size={18} /> <span className="advisor-launch-label">GigaChat помощник</span>
        {configured && answer && <span className="advisor-ready" aria-label="Совет готов" />}
      </button>
      {open && (
        <section
          className="advisor-panel"
          id="giga-advisor-panel"
          role="dialog"
          aria-label="Помощник GigaChat"
        >
          <div className="advisor-head">
            <span>
              <Sparkles size={20} /> GigaChat
            </span>
            <button aria-label="Закрыть помощника" onClick={() => onOpenChange(false)}>
              <X size={19} />
            </button>
          </div>
          <div className="advisor-body">
            <span className="advisor-status">
              {configured === null
                ? 'Проверяем подключение'
                : configured
                  ? (answer ? 'GigaChat ответил' : 'Ключ настроен') + ' · экран «' + screen + '»'
                  : STATIC_DEMO
                    ? 'Онлайн-демо без сервера'
                    : 'Нужна настройка сервера'}
            </span>
            {configured === false && STATIC_DEMO ? (
              <div className="advisor-empty">
                <h3>GigaChat доступен локально</h3>
                <p>
                  Онлайн-демо работает без сервера, поэтому советы GigaChat здесь не приходят. Все
                  расчёты на экранах доступны. Чтобы поговорить с GigaChat, запусти проект локально
                  с ключом в <code>.env</code>.
                </p>
              </div>
            ) : configured === false ? (
              <div className="advisor-empty">
                <h3>Подключите GigaChat</h3>
                <p>
                  Добавьте ключ авторизации в <code>limit-budget/.env</code> как{' '}
                  <code>GIGACHAT_AUTH_KEY=...</code> и перезапустите сервер. Ключ остаётся на
                  сервере. Демонстрационные расчёты доступны уже сейчас.
                </p>
              </div>
            ) : (
              <>
                {loading && (
                  <p className="advisor-loading" role="status">
                    GigaChat разбирает данные экрана…
                  </p>
                )}
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <div className="advisor-dialogue" aria-live="polite">
                  {conversation.map((message, index) => (
                    <p className={`advisor-message ${message.role}`} key={index}>
                      {message.content}
                    </p>
                  ))}
                </div>
                {answer && (
                  <div className="advisor-answer">
                    <div>
                      <strong>Что попробовать</strong>
                      <p>{answer.nextStep}</p>
                    </div>
                    <small>{answer.followUp}</small>
                  </div>
                )}
                {!conversation.length && !loading && !error && (
                  <p className="muted">Готовлю совет по текущему разделу.</p>
                )}
              </>
            )}
          </div>
          {configured && (
            <form className="advisor-form" onSubmit={submitQuestion}>
              <p className="advisor-disclosure">
                Вопрос и расчёты текущего раздела отправляются в GigaChat. Встроенная история
                операций вымышленная.
              </p>
              <input
                aria-label="Вопрос GigaChat"
                placeholder="Спросите про свой бюджет…"
                maxLength={500}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <button
                className="primary"
                type="submit"
                disabled={loading || !question.trim()}
                aria-label="Отправить вопрос"
              >
                <ArrowRight size={18} />
              </button>
            </form>
          )}
        </section>
      )}
    </>
  );
}
