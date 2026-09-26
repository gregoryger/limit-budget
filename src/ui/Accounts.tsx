import { ArrowRight, Wallet } from 'lucide-react';
import type { Assumptions, Budget } from '../../shared/budget-calculation';
import { rub } from '../../shared/transactions';
export function Accounts({
  assumptions,
  budget,
  hasData,
  onEdit,
  onSimulate,
}: {
  assumptions: Assumptions;
  budget: Budget;
  hasData: boolean;
  onEdit: () => void;
  onSimulate: () => void;
}) {
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Мои счета</p>
          <h1>Карты и счета</h1>
          <p className="muted">Всё под рукой. Две условные карты — без подключения к банку.</p>
        </div>
        <Wallet size={30} className="yellow" />
      </div>
      <div className="accounts-grid">
        {[
          { name: 'Основной счёт', mask: '4821', title: 'На повседневные траты' },
          { name: 'Накопления', mask: '1364', title: 'Отложенные деньги' },
        ].map((card, i) => (
          <div className="account-stack" key={card.mask}>
            <div className={`account-card account-${i}`}>
              <div>
                <span>{card.name}</span>
                <b>ЛИМИТ</b>
              </div>
              <span className="card-chip" />
              <p className="masked-card">•••• {card.mask}</p>
              <footer>
                Демо-карта <span>МИР</span>
              </footer>
            </div>
            <section className="glass">
              <h2>{card.title}</h2>
              <p className="muted small">
                Остаток по этой карте не задан. Выписка анализируется целиком, без распределения по
                счетам.
              </p>
            </section>
          </div>
        ))}
        <div className="account-stack">
          <section className="glass glow-panel">
            <span className="eyebrow">Общий остаток</span>
            <p className="account-total">
              {assumptions.currentBalanceKopecks === null
                ? 'Не указан'
                : rub(assumptions.currentBalanceKopecks)}
            </p>
            <p className="small muted">
              {assumptions.currentBalanceKopecks === null
                ? 'Введите общий остаток в обзоре.'
                : `Введён вручную на ${assumptions.asOf}.`}
            </p>
            <button className="text-link" onClick={onEdit}>
              {hasData ? 'Изменить остаток' : 'Загрузить выписку'}
              <ArrowRight size={15} />
            </button>
          </section>
          <section className="glass">
            <h2>До конца периода</h2>
            <p className="account-total yellow">
              {budget.dailyLimit === null ? '—' : rub(budget.dailyLimit)}
            </p>
            <p className="small muted">
              В день после указанных обязательных платежей. Будущие поступления учитываются по вашим
              допущениям.
            </p>
          </section>
        </div>
      </div>
      <div className="glass account-action">
        <div>
          <h2>Проверь перевод до решения</h2>
          <p className="small muted">Посмотри, как разовый расход повлияет на бюджет.</p>
        </div>
        <button className="primary" onClick={onSimulate}>
          Открыть симулятор
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="notice">
        Номера карт — только маски. Общий остаток не распределяется между этими картами; сервис не
        имеет доступа к счетам.
      </div>
    </>
  );
}
