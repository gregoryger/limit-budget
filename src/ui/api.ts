/** Статическая сборка для GitHub Pages (`vite build --mode pages`): сервера нет. */
export const STATIC_DEMO = import.meta.env.MODE === 'pages';
export const STATIC_DEMO_NOTE =
  'Онлайн-демо работает без сервера: загрузка выписки и GigaChat доступны при локальном запуске проекта.';
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  if (STATIC_DEMO) {
    if (url === '/api/health') return { ok: true, gigachatConfigured: false } as T;
    throw new Error(STATIC_DEMO_NOTE);
  }
  // A multipage PDF may require several sequential model calls.
  const response = await fetch(url, {
    ...options,
    signal: url === '/api/import' ? undefined : AbortSignal.timeout(150000),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос');
  return data;
}
export const json = (data: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
