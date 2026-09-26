# Договор между модулями

Все денежные поля API и внутренних типов — **целые копейки**, абсолютные величины; направление — отдельное поле. ISO-даты `YYYY-MM-DD`, без локальных времён. UI переводит рубли в копейки строковым разбором (без умножения дробного float).

## Поток

```text
CSV/PDF (Buffer)
  → statement-import.extractStatement()
  → SourceRow[] (все строки, включая неизвестные)
  → gigachat.extractWithGigaChat() или фиксированный demoResponse
  → modelResponseSchema + transactions.validateModelResponse()
  → ReviewRow[]
  → пользовательские решения include/exclude + исправления и причина
  → подтверждённые Transaction[] + audit на сервере
  → budget-calculation.calculateBudget(transactions, assumptions)
  → Budget → gigachat.explainBudget(Budget)
  → UI и scenarios.simulate()/simulatePlannedExpense() на той же базе расчёта
```

Для PDF нет прикладного ограничения по размеру и количеству строк. Адаптер делит строки на запросы до 60 строк и 12 000 символов, проверяет каждый структурированный ответ относительно его части выписки и объединяет результаты. Исходная строка, которая не помещается даже в один запрос, остаётся в `skipped` для ручного решения. Экран проверки отображает 50 строк за раз, сохраняя решения по всем строкам. Подтверждение принимает решение для каждой исходной строки независимо от размера PDF.

## Общие типы

Источник схем — `shared/transactions.ts`. JSON Schema генерируется через `zodToJsonSchema(modelResponseSchema)` непосредственно для запроса провайдеру; сервер валидирует той же Zod-схемой.

```ts
type SourceRow = {
  id: string;
  raw: string;
  date: string | null;
  description: string | null;
  amountKopecks: number | null;
  direction: 'income' | 'expense' | null;
  issue?: string;
};

type Transaction = {
  sourceId: string;
  date: string;
  description: string;
  amountKopecks: number;
  direction: 'income' | 'expense';
  category:
    | 'Подработка'
    | 'Стипендия'
    | 'Продукты'
    | 'Кафе'
    | 'Транспорт'
    | 'Жильё'
    | 'Подписки'
    | 'Переводы'
    | 'Другое';
  recurring: boolean;
  suspicious: boolean;
  note: string;
};

type ModelResponse = {
  transactions: Transaction[];
  skipped: { sourceId: string; reason: string }[];
};

type ReviewRow = {
  source: SourceRow;
  transaction: Transaction | null;
  issues: string[];
};
```

Модель не может добавить источник. Повторный/неизвестный `sourceId` блокирует ответ целиком. Несовпадение суммы, даты, направления или описания оставляет `transaction=null`, исходник и причины видны. Отсутствующие в ответе строки также сохраняются. Свободный текст, Markdown-fence и неполный JSON не превращаются в транзакции.

## REST API

Все ошибки: `{ "error": "понятное сообщение" }`, HTTP 4xx/5xx. Никаких сырых ошибок провайдера или ключей. Ответы API `Cache-Control: no-store`.

| Метод и путь                   | Вход                                                                        | Выход                                                          |
| ------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /api/health`              | —                                                                           | `{ok, gigachatConfigured}` без ключа                           |
| `POST /api/import`             | multipart: `file`, `safeData="true"`; либо `demo="true"`, `safeData="true"` | `ImportResult` с UUID, filename, mode, notice, rows, expiresAt |
| `POST /api/import/:id/confirm` | `{decisions: Decision[]}`                                                   | `{transactions, audit}`                                        |
| `POST /api/budget`             | `{importId, assumptions}`                                                   | `{budget, explanation, explanationMode}`                       |
| `DELETE /api/import/:id`       | —                                                                           | `204`; удаляет память импорта                                  |

```ts
type Decision = {
  sourceId: string;
  include: boolean;
  transaction: Transaction | null;
  reviewed: boolean;
  reason: string;
};
```

На каждую исходную строку нужно ровно одно решение. При исключении обязательна причина. При любом исправлении или спорной строке обязательны `reviewed=true` и непустая причина. Описание сохраняется из источника; для неизвестных PDF-строк сохраняется исходный текст. Пустой подтверждённый импорт отклоняется. Журнал содержит оригинал, действие (`accepted`, `corrected`, `excluded`), итоговую операцию и причину. Ручное исправление суммы может отличаться от распознанной: это осознанное пользовательское действие, отличимое в аудите от вывода модели.

UUID используется как временный дескриптор в локальной демонстрации, а не как полноценная авторизация. До 100 активных импортов, срок 30 минут, фоновые удаления раз в минуту. Для многопользовательского сервиса слой сессий нужно заменить авторизованным хранилищем.

## Расчёт

Схема `Assumptions` находится в `shared/budget-calculation.ts`:

```ts
type Assumptions = {
  asOf: string; // остаток на конец дня
  endDate: string; // последний день прогноза включительно
  currentBalanceKopecks: number | null;
  futurePaymentsKopecks: number | null;
  futureIncomeKopecks: number;
  dailySpendKopecks: number;
};
```

```text
income   = сумма подтверждённых income
expenses = сумма подтверждённых expense
net      = income − expenses                  // история, не текущий остаток!
days     = UTC-дней между asOf и endDate
available = currentBalance + futureIncome − futurePayments
projected = available − days × dailySpend
dailyLimit = floor(available / days)          // округление вниз в копейках
```

Если остаток или обязательства `null`, `complete=false`, `available/projected/dailyLimit=null`. Нулевые значения считаются явно указанными. При `days=0` `dailyLimit=null`, ежедневные расходы не вычитаются. `byCategory` строится только по расходам. `recurring` содержит только отмеченные расходные операции; это список гипотез, а не автоматически начисленные будущие обязательства.

`scenarios.simulate(transactions, base, dailySpendKopecks, transferKopecks)` возвращает новый `Budget`, прибавляя разовый расход к обязательствам и меняя ежедневные траты. Входы и история не мутируются; сетевой перевод не выполняется. При неизвестных обязательствах прогноз остаётся неизвестным.

`free-money` принимает пять подтверждённых будущих сумм в копейках: `housing`, `communication`, `transport`, `subscriptions`, `other`. `totalObligations()` складывает их без округления; общая сумма ограничена 100 млн ₽. `calculateFreeMoney(currentBalanceKopecks, breakdown)` возвращает сумму резервирования, баланс после обязательств, `freeKopecks = max(0, баланс − обязательства)` и отдельный `deficitKopecks`. Если баланс или обязательства неизвестны, результат остаётся `null`. Будущие доходы и ежедневные траты не включены в свободную сумму. UI сохраняет сумму категорий как `assumptions.futurePaymentsKopecks` и обновляет общий прогноз; прежняя общая сумма при первом открытии показывается в категории `other`, поэтому не складывается с разбивкой повторно. Исторические `recurring` не становятся обязательствами автоматически.

`scenarios.parseScenarioQuestion(question)` локально распознаёт ограниченные вопросы о покупке и аренде с ценой после слова `за`; нераспознанный вопрос возвращает ошибку и может быть введён вручную. `simulatePlannedExpense(transactions, assumptions, expense)` принимает описание, положительную сумму одного платежа в копейках, `frequency: 'once' | 'monthly'` и `firstPaymentDate`. Возвращает исходный и сценарный `Budget`, даты платежей внутри периода, общую стоимость, изменение прогноза и дефицит. `decideScenario(transactions, comparison)` возвращает рекомендацию `buy_now | wait | cut_spending | insufficient_data`, оценку срока ожидания, необходимого сокращения расходов и проверку ежемесячной нагрузки. Срок ожидания вычисляется из положительного чистого потока подтверждённых операций за не менее 14 дней и начинается после конца выбранного прогноза. Это условная экстраполяция, а не датированный доход. Ежемесячная нагрузка сравнивается с историческим накоплением за 30 дней с резервом 10%. Ежемесячные даты привязаны ко дню первого платежа; в коротких месяцах используются последние дни. Сценарий добавляется к уже заявленным обязательствам; он не изменяет подтверждённые транзакции. Даты других поступлений и обязательств неизвестны, поэтому итог на конец периода не является гарантией наличия денег в день платежа.

`POST /api/scenario` принимает `{importId, assumptions, expense}` по схемам выше. Сервер берёт операции только из подтверждённой сессии, пересчитывает сравнение и решение, возвращает `{comparison, decision, explanation, explanationMode}`. При `explanationMode='gigachat'` модель объясняет уже рассчитанные величины; при `local` используется текст правил приложения. Демо-импорт никогда не выдаёт локальный текст за ответ GigaChat.

## Объяснение

`explainBudget(Budget)` получает только рассчитанный результат и допущения. В ответе API `explanationMode='gigachat'` означает отдельный настоящий запрос модели; `local` — пояснение приложения. Ошибка объяснения не отменяет уже рассчитанный бюджет. Текст модели никогда не разбирается как число и не меняет расчёт.
