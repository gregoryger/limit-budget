import type { Assumptions } from './budget-calculation.js';
import type { Transaction } from './transactions.js';

const day = 86_400_000;
const money = (rubles: number) => Math.round(rubles * 100);

export const demoObligations = [
  { name: 'Аренда комнаты', amountKopecks: money(12_000) },
  { name: 'Транспорт', amountKopecks: money(1_800) },
  { name: 'Связь', amountKopecks: money(650) },
  { name: 'Подписки', amountKopecks: money(1_047) },
  { name: 'Другие обязательные', amountKopecks: money(3_000) },
];

type DemoRow = [
  number,
  string,
  number,
  Transaction['direction'],
  Transaction['category'],
  boolean?,
];
const rows: DemoRow[] = [
  [-58, 'Стипендия', 8_000, 'income', 'Стипендия'],
  [-55, 'Подработка: дизайн', 34_000, 'income', 'Подработка'],
  [-52, 'Аренда комнаты', 12_000, 'expense', 'Жильё'],
  [-50, 'Продукты', 4_200, 'expense', 'Продукты'],
  [-48, 'Такси', 280, 'expense', 'Транспорт'],
  [-46, 'Музыка', 299, 'expense', 'Подписки', true],
  [-45, 'Видео', 399, 'expense', 'Подписки', true],
  [-44, 'Облако', 349, 'expense', 'Подписки', true],
  [-42, 'Кофе', 190, 'expense', 'Кафе'],
  [-40, 'Доставка еды', 690, 'expense', 'Кафе'],
  [-37, 'Продукты', 3_800, 'expense', 'Продукты'],
  [-34, 'Кафе', 420, 'expense', 'Кафе'],
  [-29, 'Стипендия', 8_000, 'income', 'Стипендия'],
  [-27, 'Подработка: дизайн', 44_000, 'income', 'Подработка'],
  [-26, 'Аренда комнаты', 12_000, 'expense', 'Жильё'],
  [-25, 'Продукты', 4_500, 'expense', 'Продукты'],
  [-23, 'Музыка', 299, 'expense', 'Подписки', true],
  [-22, 'Видео', 399, 'expense', 'Подписки', true],
  [-21, 'Облако', 349, 'expense', 'Подписки', true],
  [-20, 'Кофе', 240, 'expense', 'Кафе'],
  [-19, 'Доставка еды', 890, 'expense', 'Кафе'],
  [-17, 'Такси', 450, 'expense', 'Транспорт'],
  [-16, 'Кофе', 290, 'expense', 'Кафе'],
  [-15, 'Доставка еды', 760, 'expense', 'Кафе'],
  [-13, 'Продукты', 3_900, 'expense', 'Продукты'],
  [-12, 'Кофе', 210, 'expense', 'Кафе'],
  [-11, 'Такси', 620, 'expense', 'Транспорт'],
  [-9, 'Доставка еды', 1_200, 'expense', 'Кафе'],
  [-8, 'Кофе', 260, 'expense', 'Кафе'],
  [-7, 'Проездной', 1_800, 'expense', 'Транспорт'],
  [-6, 'Продукты', 2_800, 'expense', 'Продукты'],
  [-5, 'Такси', 390, 'expense', 'Транспорт'],
  [-4, 'Доставка еды', 950, 'expense', 'Кафе'],
  [-3, 'Кофе', 280, 'expense', 'Кафе'],
  [-2, 'Связь', 650, 'expense', 'Другое'],
];

export function createShowcaseData(now = new Date()) {
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const iso = (offset: number) =>
    new Date(today.getTime() + offset * day).toISOString().slice(0, 10);
  const transactions: Transaction[] = rows.map(
    ([offset, description, amount, direction, category, recurring], index) => ({
      sourceId: `demo-${index + 1}`,
      date: iso(offset),
      description,
      amountKopecks: money(amount),
      direction,
      category,
      recurring: !!recurring,
      suspicious: false,
      note: 'Вымышленная операция для демонстрации',
    }),
  );
  const assumptions: Assumptions = {
    asOf: iso(0),
    endDate: iso(30),
    currentBalanceKopecks: money(42_800),
    futurePaymentsKopecks: demoObligations.reduce((sum, item) => sum + item.amountKopecks, 0),
    futureIncomeKopecks: money(52_000),
    dailySpendKopecks: money(650),
  };
  return { transactions, assumptions };
}

export function spendingInsights(transactions: Transaction[], asOf: string) {
  const current: Transaction[] = [];
  const previous: Transaction[] = [];
  for (const transaction of transactions) {
    if (transaction.direction !== 'expense') continue;
    const age = Math.round((Date.parse(asOf) - Date.parse(transaction.date)) / day);
    if (age >= 0 && age < 30) current.push(transaction);
    if (age >= 30 && age < 60) previous.push(transaction);
  }
  const sum = (items: Transaction[]) =>
    items.reduce((total, item) => total + item.amountKopecks, 0);
  const small = current.filter((item) => item.amountKopecks <= money(500) && !item.recurring);
  const convenience = current.filter((item) => /доставка|такси/i.test(item.description));
  const currentCafe = sum(current.filter((item) => item.category === 'Кафе'));
  const previousCafe = sum(previous.filter((item) => item.category === 'Кафе'));
  return {
    current,
    previous,
    small,
    convenience,
    smallTotal: sum(small),
    convenienceTotal: sum(convenience),
    currentCafe,
    previousCafe,
  };
}

export function activeSubscriptions(transactions: Transaction[], asOf: string) {
  const recent = transactions
    .filter((item) => {
      const age = Math.round((Date.parse(asOf) - Date.parse(item.date)) / day);
      return item.direction === 'expense' && item.recurring && age >= 0 && age < 30;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return [...new Map(recent.map((item) => [item.description.toLowerCase(), item])).values()];
}

export function parseScenarioQuery(query: string) {
  const compact = query.replace(/\u00a0/g, ' ');
  const match = compact.match(
    /(\d[\d\s]*)(?:[,.](\d{1,2}))?\s*(тыс(?:яч)?|к|₽|руб(?:лей|ля|ль)?)?/i,
  );
  if (!match) return null;
  const whole = Number(match[1].replace(/\s/g, ''));
  const amount =
    (match[3] && /^(тыс|к)/i.test(match[3]) ? whole * 1000 : whole) * 100 +
    (match[2] ? Number(match[2].padEnd(2, '0')) : 0);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000_00) return null;
  const recurring = /кажд(?:ый|ую|ое)|ежемесяч|в месяц|аренд|сниму квартир|подписк/i.test(compact);
  const label = /телефон/i.test(compact)
    ? 'Покупка телефона'
    : /квартир|аренд/i.test(compact)
      ? 'Аренда жилья'
      : /ноутбук/i.test(compact)
        ? 'Покупка ноутбука'
        : 'Новый расход';
  return { amountKopecks: amount, recurring, label };
}

export function monthsToGoal(targetKopecks: number, savedKopecks: number, monthlyKopecks: number) {
  if (savedKopecks >= targetKopecks) return 0;
  if (monthlyKopecks <= 0) return null;
  return Math.ceil((targetKopecks - savedKopecks) / monthlyKopecks);
}
