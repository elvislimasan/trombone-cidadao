/** O mapa comum começa nas broncas ativas; o atalho de uma rua precisa mostrar
 * todo o histórico que foi contado na página de detalhes dela. */
export function statusInicialDoMapa(search = '') {
  return new URLSearchParams(search).has('rua') ? 'all' : 'active';
}

/** A RPC antiga entende `active` como pendentes + em andamento. Para "Todas",
 * duas consultas disjuntas incluem também as resolvidas sem duplicar broncas. */
export function statusDaConsulta(status) {
  return status === 'all' ? ['active', 'resolved'] : [status];
}
