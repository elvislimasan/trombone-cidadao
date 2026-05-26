// Popula public.cities com todos os municípios do Brasil (IBGE) via PostgREST + service role.
// Pula PE (state_id já completo) e qualquer cidade já existente. Idempotente.
import fs from 'node:fs';

function readEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = readEnv('.env');
const URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no .env');

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

console.log(`Alvo: ${URL}`);

// 1) Mapa uf -> state_id
const states = await (await fetch(`${URL}/rest/v1/states?select=id,uf`, { headers })).json();
const ufToId = Object.fromEntries(states.map((s) => [s.uf, s.id]));

// 2) Cidades já existentes (name|state_id) para não duplicar
const existing = new Set();
let from = 0;
const page = 1000;
for (;;) {
  const res = await fetch(`${URL}/rest/v1/cities?select=name,state_id`, {
    headers: { ...headers, Range: `${from}-${from + page - 1}` },
  });
  const rows = await res.json();
  rows.forEach((r) => existing.add(`${r.name}|${r.state_id}`));
  if (rows.length < page) break;
  from += page;
}
console.log(`Cidades já existentes: ${existing.size}`);

// 3) Municípios do IBGE
const ibge = await (await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios')).json();
const toInsert = [];
for (const m of ibge) {
  const uf = m.microrregiao?.mesorregiao?.UF?.sigla ?? m.regiaoImediata?.regiaoIntermediaria?.UF?.sigla;
  const state_id = ufToId[uf];
  if (!state_id) continue;
  const key = `${m.nome}|${state_id}`;
  if (existing.has(key)) continue;
  existing.add(key);
  toInsert.push({ name: m.nome, state_id });
}
console.log(`A inserir: ${toInsert.length}`);

// 4) Insere em lotes
const batch = 500;
let done = 0;
for (let i = 0; i < toInsert.length; i += batch) {
  const chunk = toInsert.slice(i, i + batch);
  const res = await fetch(`${URL}/rest/v1/cities`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(chunk),
  });
  if (!res.ok) throw new Error(`Lote ${i}: ${res.status} ${await res.text()}`);
  done += chunk.length;
  console.log(`  inseridos ${done}/${toInsert.length}`);
}
console.log('Concluído.');
