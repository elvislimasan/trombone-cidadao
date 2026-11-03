import { comLoja, indexedDbDisponivel, LOJA_ELETRICISTA } from './offlineDb';
import { ehErroDeRede } from './offlineErros';

export const ELECTRICIAN_OFFLINE_EVENT = 'electrician-offline-changed';
export const ELECTRICIAN_SYNC_EVENT = 'electrician-offline-synced';
const emit = (name, detail) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail })); };
const put = async (record) => {
  if (!indexedDbDisponivel()) throw new Error('Não foi possível guardar neste aparelho. Libere espaço e tente novamente.');
  await comLoja(LOJA_ELETRICISTA, 'readwrite', store => store.put(record));
};
export async function readElectricianCache(userId, key) {
  if (!userId || !indexedDbDisponivel()) return null;
  const record = await comLoja(LOJA_ELETRICISTA, 'readonly', store => store.get(`cache:${userId}:${key}`));
  return record?.userId === userId ? record.value : null;
}
export async function writeElectricianCache(userId, key, value) {
  if (!userId) return;
  await put({ id: `cache:${userId}:${key}`, kind: 'cache', userId, value, savedAt: Date.now() });
}
export async function electricianCachedRead(userId, key, request) {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TypeError('Failed to fetch');
    const value = await request();
    // A full disk must not turn a successful network read into an access failure.
    await writeElectricianCache(userId, key, value).catch(() => {});
    return value;
  } catch (error) {
    if (!ehErroDeRede(error)) {
      await writeElectricianCache(userId, key, null).catch(() => {});
      throw error;
    }
    const cached = await readElectricianCache(userId, key);
    if (cached == null) throw error;
    return cached;
  }
}
export async function listElectricianJobs(userId, municipalityId) {
  if (!userId || !indexedDbDisponivel()) return [];
  const rows = await comLoja(LOJA_ELETRICISTA, 'readonly', store => store.getAll());
  return (rows || []).filter(row => row.kind === 'job' && row.userId === userId
    && (!municipalityId || row.municipalityId === municipalityId)).sort((a, b) => a.createdAt - b.createdAt);
}
export async function queueElectricianJob({ userId, municipalityId, rpc, args, files = [], label, resource, previousId = null }) {
  if (!userId || !municipalityId || args.p_prefeitura !== municipalityId) throw new Error('Identificação do atendimento incompleta.');
  const jobs = await listElectricianJobs(userId, municipalityId);
  const previous = jobs.filter(job => job.resource === resource && job.state !== 'sent').at(-1);
  const id = crypto.randomUUID();
  const job = { id, kind: 'job', userId, municipalityId, rpc, args, resource, label,
    previousId: previous?.id || previousId, createdAt: Math.max(Date.now(), ...jobs.map(row => row.createdAt + 1)), state: 'pending', error: '',
    photos: files.map(({ file }, index) => {
      if (!(file instanceof Blob)) throw new Error('Não foi possível guardar uma das fotos.');
      const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
      if (!extension) throw new Error('Formato de foto inválido.');
      return { blob: file, name: file.name || `foto-${index}.${extension}`, type: file.type,
        path: `${municipalityId}/${userId}/${id}-${index}.${extension}` };
    }),
  };
  await put(job);
  emit(ELECTRICIAN_OFFLINE_EVENT);
  return job;
}

// Runs in the signed-in user's session. Never use a service key for synchronization.
export async function sendElectricianJob(client, job) {
  const checkSession = async () => {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data?.session?.user?.id !== job.userId) throw Object.assign(new Error('Entre na conta que registrou este atendimento.'), { code: 'AUTH_REQUIRED' });
  };
  await checkSession();
  // Check the receipt BEFORE uploads: a lost HTTP response may follow a COMMIT.
  const receipt = await client.rpc('electrician_offline_receipt', { p_operation: job.id });
  if (receipt.error) throw receipt.error;
  if (receipt.data) return receipt.data;
  const attachments = [];
  for (const photo of job.photos) {
    await checkSession();
    const result = await client.storage.from('municipal-demand-files').upload(photo.path, photo.blob, { contentType: photo.type, upsert: false });
    // Deterministic paths are owned by this operation; duplicate means a previous upload succeeded.
    if (result.error && !['409', '23505'].includes(String(result.error.statusCode || result.error.code))
      && !/already exists|duplicate/i.test(result.error.message || '')) throw result.error;
    attachments.push({ storage_path: photo.path, nome: photo.name, mime_type: photo.type,
      tamanho: photo.blob.size, tipo: 'conclusao', visibilidade: 'interna' });
  }
  await checkSession();
  const response = await client.rpc('sync_electrician_operation', { p_operation: job.id, p_previous: job.previousId,
    p_rpc: job.rpc, p_args: { ...job.args, ...(job.rpc === 'registrar_visita_poste_eletricista_v2' ? {} : { p_anexos: attachments }) } });
  if (response.error) throw response.error;
  return response.data;
}

let syncing = null;
export function syncElectricianJobs(client, userId) {
  if (syncing) return syncing;
  const run = async () => {
    if (!userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    const work = async () => {
      const jobs = await listElectricianJobs(userId);
      const blocked = new Set(jobs.filter(job => job.state === 'blocked').map(job => job.id));
      for (const job of jobs) {
        if (job.state !== 'pending') continue;
        if (blocked.has(job.previousId)) { blocked.add(job.id); continue; }
        try {
          const result = await sendElectricianJob(client, job);
          await put({ ...job, state: 'sent', result, photos: [], error: '', sentAt: Date.now() });
          emit(ELECTRICIAN_SYNC_EVENT, { userId, municipalityId: job.municipalityId, resource: job.resource });
        } catch (error) {
          const temporary = ehErroDeRede(error) || ['AUTH_REQUIRED', 'PGRST301', 'PGRST303'].includes(error.code)
            || /jwt|token.*expired|session/i.test(error.message || '') || Number(error.status) >= 500;
          await put({ ...job, state: temporary ? 'pending' : 'blocked', error: error.message || 'Falha ao enviar.' });
          if (temporary) break;
          blocked.add(job.id);
        }
        emit(ELECTRICIAN_OFFLINE_EVENT);
      }
    };
    // Prevent two tabs from sending the same queue simultaneously. Server receipts also protect retries.
    if (typeof navigator !== 'undefined' && navigator.locks?.request) await navigator.locks.request('electrician-sync', work);
    else await work();
  };
  syncing = run().finally(() => { syncing = null; emit(ELECTRICIAN_OFFLINE_EVENT); });
  return syncing;
}
export async function retryElectricianJob(userId, id) {
  const job = (await listElectricianJobs(userId)).find(item => item.id === id);
  if (job && job.state !== 'sent') { await put({ ...job, state: 'pending', error: '' }); emit(ELECTRICIAN_OFFLINE_EVENT); }
}

export const orderCacheKey = (municipalityId, orderId) => `order:${municipalityId}:${orderId}`;
export async function loadElectricianOrderSnapshot(client, userId, municipalityId, orderId) {
  const key = orderCacheKey(municipalityId, orderId);
  let fresh = false;
  const snapshot = await electricianCachedRead(userId, key, async () => {
    const detail = await client.from('demandas_municipais').select('*').eq('id', orderId)
      .eq('prefeitura_id', municipalityId).eq('atribuido_a', userId).eq('category_id', 'iluminacao').maybeSingle();
    if (detail.error) throw detail.error;
    if (!detail.data) throw new Error('Esta ordem não está mais atribuída a você.');
    const linked = await client.rpc('solicitacoes_ordem_eletricista', { p_prefeitura: municipalityId, p_ordem: orderId });
    if (linked.error) throw linked.error;
    const ids = [...new Set([detail.data.pole_id, ...(linked.data || []).map(row => row.pole_id)].filter(Boolean))];
    const poles = ids.length ? await client.from('poles').select('*').in('id', ids) : { data: [] };
    if (poles.error) throw poles.error;
    const nearby = await client.rpc('buscar_postes_ordem_eletricista', { p_prefeitura: municipalityId, p_ordem: orderId, p_busca: '' });
    if (nearby.error) throw nearby.error;
    fresh = true;
    return { order: detail.data, linkedReports: linked.data || [], poles: [...new Map([...(poles.data || []), ...(nearby.data || [])].map(row => [String(row.id), row])).values()], savedAt: Date.now() };
  });
  const jobs = (await listElectricianJobs(userId, municipalityId)).filter(job => job.resource === `order:${orderId}`
    && (job.state !== 'sent' || job.createdAt >= snapshot.savedAt));
  return projectElectricianOrder({ ...snapshot, offline: !fresh }, jobs);
}

export function projectElectricianOrder(snapshot, jobs) {
  const value = structuredClone(snapshot);
  for (const job of jobs) {
    value.previousId = job.id;
    if (job.state === 'blocked') { value.blocked = true; continue; }
    if (job.rpc === 'salvar_demanda_municipal') value.order.status = 'em_andamento';
    else if (job.rpc === 'atender_solicitacao_ordem_eletricista') {
      value.linkedReports = value.linkedReports.map(report => report.report_id === job.args.p_report ? { ...report, status: 'resolved' } : report);
      value.order.status = value.linkedReports.every(report => report.status === 'resolved') ? 'concluida' : 'em_andamento';
    } else value.order.status = 'concluida';
    value.pending = job.state !== 'sent';
  }
  return value;
}

export async function prepareElectricianOrders(client, userId, municipalityId, onProgress = () => {}, cityId = null) {
  let prepared = 0;
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.from('demandas_municipais').select('id').eq('prefeitura_id', municipalityId)
      .eq('atribuido_a', userId).eq('category_id', 'iluminacao')
      .not('status', 'in', '(concluida,cancelada,recusada)').order('id').range(offset, offset + 99);
    if (error) throw error;
    for (const order of data || []) {
      const snapshot = await loadElectricianOrderSnapshot(client, userId, municipalityId, order.id);
      if (snapshot.offline) throw new Error('A conexão caiu durante a preparação. Tente novamente.');
      // Unlike opportunistic caches, explicit preparation must report quota failures.
      if (!await readElectricianCache(userId, orderCacheKey(municipalityId, order.id))) throw new Error('Não foi possível guardar as ordens. Verifique o espaço do aparelho.');
      onProgress(++prepared);
    }
    if (!data || data.length < 100) break;
  }
  if (cityId) {
    const poles = [];
    for (let offset = 0; ; offset += 500) {
      const result = await client.from('poles').select('id,identifier,plate,address,latitude,longitude,lighting_status,is_broken,updated_at,lamp_type,lamp_power_w,raw_properties')
        .eq('city_id', cityId).or('lighting_status.is.null,lighting_status.neq.removido').order('id').range(offset, offset + 499);
      if (result.error) throw result.error;
      poles.push(...(result.data || []));
      if (!result.data || result.data.length < 500) break;
    }
    await writeElectricianCache(userId, `poles:${municipalityId}`, poles);
  }
  return prepared;
}

export async function cachedElectricianOrders(userId, municipalityId) {
  if (!indexedDbDisponivel()) return [];
  const rows = await comLoja(LOJA_ELETRICISTA, 'readonly', store => store.getAll());
  return (rows || []).filter(row => row.kind === 'cache' && row.userId === userId
    && row.id.startsWith(`cache:${userId}:order:${municipalityId}:`) && row.value?.order).map(row => row.value.order);
}
