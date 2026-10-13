// Use maybeSingle: apenas uma consulta bem-sucedida sem registro confirma ausência.
// Falhas de rede, permissão ou relacionamento não significam página removida.
export async function fetchPublicDetail(query) {
  try {
    const { data, error } = await query();
    if (error) return { status: 'error', error, data: null };
    return { status: data ? 'ready' : 'missing', data, error: null };
  } catch (error) {
    return { status: 'error', error, data: null };
  }
}
