import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startLegislativeRun, collectLegislativeSlice } from '../_shared/legislative/collector.js';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const equalSecret = (a: string, b: string) => { if (!a || !b || a.length !== b.length) return false;let result = 0;for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);return result === 0; };
async function requestBody(req: Request) {
  if (!req.body) throw Error('Corpo ausente.');
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];let bytes = 0;
  for (;;) {
    const next = await reader.read();if (next.done) break;bytes += next.value.byteLength;
    if (bytes > 4096) { await reader.cancel();throw Error('Corpo acima do limite.'); }chunks.push(next.value);
  }
  const buffer = new Uint8Array(bytes);let offset = 0;for (const chunk of chunks) { buffer.set(chunk, offset);offset += chunk.byteLength; }
  const body = JSON.parse(new TextDecoder().decode(buffer));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Corpo inválido.');
  return body;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método inválido.' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!, key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(url, key, { auth: { persistSession: false } });
  try {
    let body;try { body = await requestBody(req); } catch { return json({ error: 'Requisição inválida.' }, 400); }
    const cityId = Number(body.city_id || 64);
    if (!Number.isSafeInteger(cityId) || cityId <= 0) return json({ error: 'Cidade inválida.' }, 400);
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const worker = equalSecret(req.headers.get('x-legislative-worker-secret') || '', Deno.env.get('LEGISLATIVE_WORKER_SECRET') || '') || equalSecret(token, key);
    let userId = null;
    if (!worker) {
      const { data: { user }, error } = await db.auth.getUser(token);
      if (error || !user) return json({ error: 'Entre novamente na sua conta.' }, 401);
      const session = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
      const access = await session.rpc('legislative_can_manage', { p_city: cityId });
      if (access.error || !access.data) return json({ error: 'Sem permissão para gerir a coleta.' }, 403);
      userId = user.id;
    }
    if (body.action === 'tick') {
      if (!worker) return json({ error: 'Acesso restrito ao agendador.' }, 403);
      const now = new Date();const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(now);
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Fortaleza', hour: '2-digit', hourCycle: 'h23' }).format(now));
      const sources = await db.from('legislative_sources').select('*').eq('enabled', true).eq('daily_enabled', true);
      if (sources.error) throw sources.error;
      for (const source of sources.data || []) if (hour >= 3 && source.last_daily_on !== localDate) {
        await startLegislativeRun(db, source);
        const saved = await db.from('legislative_sources').update({ last_daily_on: localDate }).eq('id', source.id);
        if (saved.error) throw saved.error;
      }
      return json(await collectLegislativeSlice(db));
    }
    const source = await db.from('legislative_sources').select('*').eq('city_id', cityId).single();
    if (source.error) return json({ error: 'Fonte legislativa não configurada.' }, 404);
    if (body.action === 'start') return json({ run_id: await startLegislativeRun(db, source.data, userId) });
    if (body.action === 'process' || body.action === 'resume') {
      if (typeof body.run_id !== 'string') return json({ error: 'Informe a coleta.' }, 400);
      const run = await db.from('legislative_runs').select('source_id').eq('id', body.run_id).single();
      if (run.error || run.data.source_id !== source.data.id) return json({ error: 'Coleta de outra cidade.' }, 403);
      if (body.action === 'resume') {
        const resumed = await db.rpc('legislative_resume_run', { p_run: body.run_id });
        if (resumed.error) return json({ error: 'Não foi possível retomar. Confira se já existe outra coleta ativa.' }, 409);
        return json({ run_id: body.run_id });
      }
      return json(await collectLegislativeSlice(db, body.run_id));
    }
    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) { console.error('legislative-collector:', error instanceof Error ? error.name : 'error');return json({ error: 'Não foi possível concluir a coleta. Consulte o estado da execução e tente novamente.' }, 500); }
});
