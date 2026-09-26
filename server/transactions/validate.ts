import { modelResponseSchema, type SourceRow, type ReviewRow } from '../../shared/transactions.js';
export function validateModelResponse(data: unknown, sources: SourceRow[]): ReviewRow[] {
  const parsed = modelResponseSchema.parse(data);
  const ids = new Set(sources.map((s) => s.id));
  const seen = new Set<string>();
  const transactions = new Map(parsed.transactions.map((t) => [t.sourceId, t]));
  const skippedById = new Map(parsed.skipped.map((t) => [t.sourceId, t]));
  for (const entry of [...parsed.transactions, ...parsed.skipped]) {
    if (!ids.has(entry.sourceId)) throw new Error('Модель добавила неизвестную строку');
    if (seen.has(entry.sourceId)) throw new Error('Модель повторила строку');
    seen.add(entry.sourceId);
  }
  return sources.map((source) => {
    const t = transactions.get(source.id);
    const skipped = skippedById.get(source.id);
    const issues: string[] = [];
    if (source.issue) issues.push(source.issue);
    if (!t)
      return {
        source,
        transaction: null,
        issues: [...issues, skipped?.reason ?? 'Модель пропустила строку. Проверьте вручную.'],
      };
    if (source.amountKopecks === null || t.amountKopecks !== source.amountKopecks)
      issues.push('Сумма не подтверждена исходной строкой');
    if (!source.date || source.date !== t.date)
      issues.push('Дата не подтверждена исходной строкой');
    if (!source.direction || source.direction !== t.direction)
      issues.push('Направление операции неоднозначно');
    if (!source.description || source.description !== t.description)
      issues.push('Описание не совпадает с источником');
    // Unverifiable model values never become transactions automatically.
    if (issues.length) return { source, transaction: null, issues };
    if (t.suspicious) issues.push(t.note || 'Модель отметила сомнительную операцию');
    return { source, transaction: t, issues };
  });
}
