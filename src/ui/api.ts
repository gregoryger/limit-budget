export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
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
