// Diagnostico somente-leitura da exportacao do mapa contra o Supabase indicado
// no .env. Gera artefatos locais; nao executa insert, update, delete ou RPC.
import fs from 'node:fs';
import path from 'node:path';

import { criarPdfDoMapaDeRuas } from '../src/lib/pavementMapPdf.js';

const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
}
const baseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!baseUrl || !key) throw new Error('Credenciais do Supabase ausentes no .env');
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const get = async (table, params) => {
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${new URLSearchParams(params)}`, { headers });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  return response.json();
};

const [state] = await get('states', { select: 'id,uf', uf: 'eq.PE', limit: '1' });
if (!state) throw new Error('Estado PE nao encontrado');
const [city] = await get('cities', { select: 'id,name', name: 'eq.Floresta', state_id: `eq.${state.id}`, limit: '1' });
if (!city) throw new Error('Floresta - PE nao encontrada');
const rows = await get('pavement_streets', {
  select: '*,bairro:bairros!pavement_streets_bairro_id_fkey(name)',
  city_id: `eq.${city.id}`,
  limit: '1000',
});
const streets = rows.map((street) => ({
  ...street,
  location: street.location ? { lat: street.location.coordinates[1], lng: street.location.coordinates[0] } : null,
  linhas: Array.isArray(street.path?.coordinates)
    ? street.path.coordinates.map((line) => line.map(([lng, lat]) => [lat, lng]))
    : [],
}));
const boundary = JSON.parse(fs.readFileSync('src/data/ibge/floresta-pe-urban-boundary.json', 'utf8'));
const latest = rows.reduce((value, street) => (
  street.updated_at && street.updated_at > value ? street.updated_at : value
), '');
const outputDir = path.resolve('tmp_pavement_prod');
fs.mkdirSync(outputDir, { recursive: true });
const comparativoDeTolerancia = [];
for (const toleranciaEncontro of [0.45, 0.7, 1, 1.3]) {
  const teste = criarPdfDoMapaDeRuas({
    ruas: streets,
    cidade: 'Floresta · PE',
    atualizadoEm: latest,
    limiteUrbano: boundary,
    toleranciaEncontro,
  });
  comparativoDeTolerancia.push({
    toleranciaEncontro,
    quadras: teste.tromboneMapStats.quadras,
    quadrasPorBairro: teste.tromboneMapStats.quadrasPorBairro,
  });
}
const doc = criarPdfDoMapaDeRuas({
  ruas: streets,
  cidade: 'Floresta · PE',
  atualizadoEm: latest,
  limiteUrbano: boundary,
  mostrarNomesRuas: true,
  toleranciaEncontro: Number(process.env.MAP_SNAP_TOLERANCE || 1),
});
fs.writeFileSync(path.join(outputDir, 'mapa-floresta.pdf'), Buffer.from(doc.output('arraybuffer')));
console.log(JSON.stringify({
  project: new URL(baseUrl).hostname.split('.')[0],
  cityId: city.id,
  ...doc.tromboneMapStats,
  comparativoDeTolerancia,
  quadrasPorBairro: doc.tromboneMapStats.quadrasPorBairro,
  output: path.join(outputDir, 'mapa-floresta.pdf'),
}, null, 2));
