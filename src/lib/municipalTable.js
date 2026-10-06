const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function municipalTableRows(rows, { search = '', searchText, sortValue, direction = 'asc' }) {
  const terms = normalize(search).trim().split(/\s+/).filter(Boolean);
  return rows.filter((row) => terms.every((term) => normalize(searchText(row)).includes(term)))
    .sort((a, b) => {
      const first = sortValue(a), second = sortValue(b);
      const result = typeof first === 'number' && typeof second === 'number' ? first - second : collator.compare(String(first ?? ''), String(second ?? ''));
      return (direction === 'desc' ? -result : result) || collator.compare(String(a.id), String(b.id));
    });
}

// A paginação visual considera todos os registros permitidos pelo RLS,
// sem truncar a busca no limite padrão de resposta do Supabase.
export async function loadMunicipalRows(queryFactory) {
  const rows = [];
  const batch = 500;
  for (let offset = 0; ; offset += batch) {
    const { data, error } = await queryFactory().range(offset, offset + batch - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if ((data || []).length < batch) return { data: rows, error: null };
  }
}
