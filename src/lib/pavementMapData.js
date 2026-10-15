// Carrega toda a base da cidade antes de aplicar filtros na tela e nos relatórios.
export async function carregarRuasDoMapa(supabase, cityId) {
  if (!cityId) throw new Error('Selecione uma cidade antes de gerar o mapa.');
  const ruas = [];
  const tamanhoPagina = 500;
  for (let inicio = 0; ; ) {
    const { data, error } = await supabase.from('pavement_streets')
      .select('*,bairro:bairros!pavement_streets_bairro_id_fkey(name)')
      .eq('city_id', cityId).order('id').range(inicio, inicio + tamanhoPagina - 1);
    if (error) throw error;
    ruas.push(...(data || []).map(rua => ({
      ...rua,
      location: rua.location ? { lat: rua.location.coordinates[1], lng: rua.location.coordinates[0] } : null,
      linhas: rua.path?.coordinates?.map(linha => linha.map(([lng, lat]) => [lat, lng])) || [],
    })));
    if (!data?.length) return ruas;
    inicio += data.length;
  }
}
