export function pendingReportsByCategory(reports) {
  const counts = new Map();
  const seen = new Set();
  for (const report of reports || []) {
    if (report.status !== 'pending' || report.is_public === false
      || (report.moderation_status && report.moderation_status !== 'approved')) continue;
    if (report.id != null) {
      if (seen.has(String(report.id))) continue;
      seen.add(String(report.id));
    }
    const id = String(report.category?.id ?? report.category_id ?? 'outros');
    const entry = counts.get(id) || { id, name: report.category?.name || 'Outros', value: 0 };
    entry.value++;
    counts.set(id, entry);
  }
  return [...counts.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'));
}
