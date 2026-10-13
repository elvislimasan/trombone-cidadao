export function seoText(value, maxLength = 160) {
  return String(value || '').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function publicDetailSeo({ path, id, title, description }) {
  return {
    title: `${seoText(title, 120)} | Trombone Cidadão`,
    description: seoText(description || title),
    url: `https://trombonecidadao.com.br/${path}/${encodeURIComponent(id)}`,
  };
}

export function guidePageSeo({ categoryId, category, entries = [], cityId, cityName, loading, dataReady }) {
  const city = cityId == null ? 'todas as cidades' : cityName || 'esta cidade';
  const categoryName = category?.name || (categoryId === 'sem-categoria' ? 'Outros locais' : 'Guia da Cidade');
  const names = entries.slice(0, 3).map((entry) => entry.name).filter(Boolean).join(', ');
  const description = categoryId
    ? `${categoryName} em ${city}: ${entries.length} ${entries.length === 1 ? 'local cadastrado' : 'locais cadastrados'}.${names ? ` Consulte ${names}.` : ''}`
    : `Explore serviços, comércio, turismo e transporte em ${city}.${names ? ` Encontre ${names}.` : ''}`;
  const path = categoryId ? `/guia-da-cidade/categoria/${encodeURIComponent(categoryId)}` : '/guia-da-cidade';
  const query = categoryId || cityId != null ? `?cidade=${cityId ?? 'todas'}` : '';
  const categoryMissing = categoryId && !category && categoryId !== 'sem-categoria';
  return {
    title: `${categoryName}${cityId != null ? ` em ${city}` : ''} | Trombone Cidadão`,
    description: seoText(description),
    url: `https://trombonecidadao.com.br${path}${query}`,
    // Dados ainda carregando ou consulta com erro não demonstram página vazia.
    robots: !loading && dataReady && categoryId && (categoryMissing || entries.length === 0) ? 'noindex' : undefined,
  };
}
