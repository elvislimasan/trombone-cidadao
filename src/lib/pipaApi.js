import { supabase } from '@/lib/customSupabaseClient';

export async function pipaRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(['PGRST202', '42P01', '42883'].includes(error.code) ? name === 'pipa_driver_login_details'
    ? 'A consulta de login está indisponível. Entre em contato com a administração da plataforma.'
    : 'Atualize o banco da Operação-pipa com as migrações 415 a 419.' : error.message);
  return data;
}
// Consulta todas as páginas; o limite padrão do PostgREST não pode truncar relatórios.
async function readAll(table, channelIds) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select('*').in('channel_id', channelIds).order('id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export async function loadPipaData(channels) {
  const ids = channels.map(c => c.id);
  if (!ids.length) return { tanks: [], drivers: [], requests: [], deliveries: [], quotas: [], routes: [] };
  const [tanks, drivers, requests, deliveries, routes] = await Promise.all(['pipa_tanks', 'pipa_drivers', 'pipa_requests', 'pipa_deliveries', 'pipa_routes'].map(t => readAll(t, ids)));
  const quotas = [];
  // Filtra por driver_id usando a tabela filha, que também tem RLS.
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from('pipa_quotas').select('*').order('driver_id').order('month').range(offset, offset + 499);
    if (result.error) throw result.error;
    quotas.push(...result.data.filter(q => drivers.some(d => d.id === q.driver_id)));
    if (result.data.length < 500) break;
  }
  return { tanks, drivers, requests, routes: routes.sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date)), deliveries: deliveries.sort((a, b) => b.delivered_at.localeCompare(a.delivered_at)), quotas };
}
export async function createPipaLogin(driverId, email) {
  const { data, error } = await supabase.functions.invoke('create-pipa-account', { body: { driver_id: driverId, email } });
  if (error) {
    let body;
    try { body = await error.context?.json(); } catch { /* Sem resposta JSON. */ }
    throw new Error(body?.error || 'Não foi possível criar o login. Confira se a função create-pipa-account foi publicada.');
  }
  if (!data?.temporary_password) throw new Error('O servidor não retornou as credenciais.');
  return data;
}
