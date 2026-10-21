// Dry run by default. Apply requires an existing authenticated municipal session.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseLightingRows, matchLightingRows, prepareLightingRequests } from './lib/lightingServiceRequests.mjs';
import { validateLightingReview, planReviewedInventory, reviewedInventoryRpc, matchReviewedLightingRows } from './lib/lightingServiceReview.mjs';

const args = process.argv.slice(2);
const options = { apply: false, radius: 20, cityId: null, input: null, output: '.tmp/ilumina-service-plan.json' };
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--apply') options.apply = true;
  else if (['--city-id', '--input', '--output', '--radius', '--review'].includes(arg)) {
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Valor ausente: ${arg}`);
    if (arg === '--city-id') options.cityId = Number(value);
    if (arg === '--radius') options.radius = Number(value);
    if (arg === '--input') options.input = value;
    if (arg === '--output') options.output = value;
    if (arg === '--review') options.review = value;
  } else throw new Error(`Argumento inválido: ${arg}`);
}
if (!options.input || !Number.isSafeInteger(options.cityId) || options.cityId <= 0
  || !Number.isFinite(options.radius) || options.radius <= 0 || options.radius > 30) {
  throw new Error('Uso: node scripts/import-lighting-service-requests.mjs --city-id ID --input linhas.json [--review revisao.json] [--output plano.json] [--radius 20] [--apply]');
}
const env = { ...dotenv.parse(await fs.readFile('.env', 'utf8')), ...process.env };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const linked = (await fs.readFile('supabase/.temp/project-ref', 'utf8')).trim();
if (new URL(url).hostname.split('.')[0] !== linked) throw new Error('O banco do .env difere do projeto Supabase vinculado.');
const token = env.MUNICIPAL_REPORT_ACCESS_TOKEN;
if (options.apply && !token) throw new Error('Defina MUNICIPAL_REPORT_ACCESS_TOKEN com a sessão autenticada do autor municipal antes de aplicar.');
const key = options.apply ? (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY) : env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('Credencial do Supabase ausente.');
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    ...(options.apply ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    fetch: (u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(30000) }),
  },
});
const checked = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const municipality = checked(await db.from('prefeituras').select('id,city_id,nome,status').eq('city_id', options.cityId).eq('status', 'ativa').single());
async function loadPoles() {
  const poles = [];
  for (let offset = 0; ; offset += 1000) {
    const page = checked(await db.from('poles').select('id,city_id,identifier,plate,address,latitude,longitude,validation_status,lighting_status,lamp_type,lamp_power_w,raw_properties')
      .eq('city_id', options.cityId).order('id').range(offset, offset + 999));
    poles.push(...page);
    if (page.length < 1000) return poles;
  }
}
let poles = await loadPoles();
const rawRows = JSON.parse(await fs.readFile(options.input, 'utf8'));
const sourceId = createHash('sha256').update(JSON.stringify(rawRows)).digest('hex');
const rows = parseLightingRows(rawRows);
let review = null;
// The reviewed Floresta PDF always uses its checked-in corrections, even when
// the generic command is run without --review. Other inputs remain unchanged.
const defaultReview = new URL('./data/ilumina-pe-floresta-2026.review.json', import.meta.url);
if (options.review) review = JSON.parse(await fs.readFile(options.review, 'utf8'));
else {
  try {
    const candidate = JSON.parse(await fs.readFile(defaultReview, 'utf8'));
    if (candidate.sourceId === sourceId && candidate.cityId === options.cityId) review = candidate;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (review) validateLightingReview(review, rows, { ...options, sourceId });
const inventory = review ? planReviewedInventory(poles, review) : { poles, changes: [] };
const build = (inventoryPoles) => {
  const result = review ? matchReviewedLightingRows(rows, inventoryPoles, review, { ...options, sourceId })
    : { matches: matchLightingRows(rows, inventoryPoles, options), excluded: [] };
  return { ...prepareLightingRequests(result.matches, { ...options, municipalityId: municipality.id, sourceId }), matches: result.matches, excluded: result.excluded };
};
let { requests, pending, matches, excluded } = build(inventory.poles);
const plan = {
  project: linked, municipality, sourceId, input: options.input, createdAt: new Date().toISOString(),
  summary: {
    sourceRows: rows.length, requests: requests.length, coveredRows: requests.reduce((n, r) => n + r.sourceRows.length, 0),
    pendingRows: pending.length, codeMatches: matches.filter((m) => m.method === 'code' && !m.reason).length,
    coordinateConflicts: requests.reduce((n, r) => n + r.warnings.length, 0),
    excludedRows: excluded.length,
  },
  requests, pending, excluded, saved: [], existing: [],
  review: review ? { sourceId: review.sourceId, reviewedAt: review.reviewedAt } : null,
  inventoryChanges: inventory.changes, inventoryApplied: [],
};
await fs.mkdir(path.dirname(options.output), { recursive: true });
const checkpoint = () => fs.writeFile(options.output, JSON.stringify(plan, null, 2));
await checkpoint();
console.log(JSON.stringify({ project: linked, ...plan.summary, apply: options.apply, output: options.output }));
if (options.apply) {
  const user = checked(await db.auth.getUser(token)).user;
  const membership = checked(await db.from('prefeitura_membros').select('user_id')
    .eq('prefeitura_id', municipality.id).eq('user_id', user.id).eq('ativo', true).maybeSingle());
  if (!membership) throw new Error('O autor não é membro ativo desta prefeitura.');
  plan.authorId = user.id;
  await checkpoint();
  if (review) {
    // Re-read before each mutation so reruns recover lost RPC responses without
    // duplicating poles and preserve changes made after the reviewed snapshot.
    let done = false;
    for (let attempt = 0; attempt <= review.inventoryOperations.length; attempt++) {
      poles = await loadPoles();
      const remaining = planReviewedInventory(poles, review).changes;
      if (!remaining.length) { done = true; break; }
      const change = remaining[0];
      plan.nextInventoryChange = change;
      await checkpoint();
      const poleId = checked(await db.rpc('gerir_iluminacao_municipal_detalhado', reviewedInventoryRpc(change, options.cityId)));
      plan.inventoryApplied.push({ operation: change.index, action: change.action, poleId });
      await checkpoint();
    }
    if (!done) throw new Error('As correções do inventário não convergiram; confira o plano salvo.');
    delete plan.nextInventoryChange;
    ({ requests, pending, matches, excluded } = build(poles));
    Object.assign(plan, { requests, pending, excluded });
    Object.assign(plan.summary, { requests: requests.length, coveredRows: requests.reduce((n, r) => n + r.sourceRows.length, 0), pendingRows: pending.length, excludedRows: excluded.length });
    await checkpoint();
    if (pending.some((p) => p.reason === 'reviewed_pole_missing')) throw new Error('Há vínculos revisados sem poste no destino; confira o inventário antes de importar solicitações.');
  }
  // Deterministic UUIDs and pre-insert reads allow safe recovery after a lost response.
  // Never upsert: an existing request may already have been handled by the team.
  for (const { payload } of requests) {
    const existing = checked(await db.from('reports').select('id,protocol,city_id,pole_id,issue_type,created_by_municipality,is_public,moderation_status')
      .eq('id', payload.id).maybeSingle());
    if (existing) {
      if (existing.city_id !== payload.city_id || existing.pole_id !== payload.pole_id
        || existing.created_by_municipality !== payload.created_by_municipality || existing.issue_type !== 'other'
        || existing.is_public !== false || existing.moderation_status !== 'internal') {
        throw new Error(`Cadastro existente difere da importação: ${payload.id}`);
      }
      plan.existing.push(existing);
    } else {
      const duplicates = checked(await db.from('reports').select('id')
        .eq('city_id', options.cityId).eq('pole_id', payload.pole_id)
        .eq('created_by_municipality', municipality.id).ilike('title', 'Ilumina PE%'));
      if (duplicates.length) throw new Error(`Já existe solicitação Ilumina PE para o poste ${payload.pole_id}; concilie o cadastro antes de importar.`);
      const saved = checked(await db.from('reports').insert({ ...payload, author_id: user.id })
        .select('id,protocol,pole_id,issue_type,is_public,moderation_status,created_by_municipality').single());
      if (saved.issue_type !== 'other' || saved.is_public !== false || saved.moderation_status !== 'internal'
        || saved.pole_id !== payload.pole_id || saved.created_by_municipality !== municipality.id) {
        throw new Error(`Solicitação gravada com campos divergentes: ${payload.id}`);
      }
      plan.saved.push(saved);
    }
    await checkpoint();
  }
  plan.finishedAt = new Date().toISOString();
  await checkpoint();
  console.log(JSON.stringify({ saved: plan.saved.length, existing: plan.existing.length, pendingRows: pending.length, output: options.output }));
}
