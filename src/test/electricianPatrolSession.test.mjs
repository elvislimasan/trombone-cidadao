import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as patrol from '@/lib/electricianPatrol';
import * as geo from '@/lib/navGeo';

const require = createRequire(import.meta.url);
const win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
}
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
const position = { lat: -8.6, lng: -38.57, accuracy: 5 };
const pole = (id, meters) => ({ id, latitude: position.lat + meters / 111195, longitude: position.lng, lighting_status: 'aceso' });

function setup({ rows = [pole(1, 4), pole(2, 850)], cached = null, failure = null } = {}) {
  const queries = [];
  const cache = new Map(cached ? [['patrol:city', cached]] : []);
  const reports = rows.map((p, i) => ({ pole_id: p.id, issue_type: 'no_lighting', neighborhood: 'Centro', created_at: i === 1 ? '2020-01-01' : '2026-01-01' }));
  const supabase = { from(table) {
    let range = [0, 499];
    const calls = [];
    queries.push({ table, calls });
    const query = new Proxy({}, { get(_, key) {
      if (key === 'then') return (resolve, reject) => Promise.resolve({ data: (table === 'poles' ? rows : table === 'reports' ? reports : []).slice(range[0], range[1] + 1), error: failure }).then(resolve, reject);
      return (...args) => { calls.push([key, ...args]); if (key === 'range') range = args; return query; };
    } });
    return query;
  } };
  const mocks = {
    '@/lib/customSupabaseClient': { supabase },
    '@/lib/electricianPatrol': patrol,
    '@/lib/navGeo': geo,
    '@/contexts/SupabaseAuthContext': { useAuth: () => ({ user: { id: 'worker' } }) },
    '@/lib/electricianOffline': { readElectricianCache: async (_, key) => cache.get(key), writeElectricianCache: async (_, key, value) => cache.set(key, value) },
    '@/lib/offlineErros': { ehErroDeRede: error => error.message === 'Failed to fetch' },
  };
  const source = readFileSync(new URL('../hooks/useElectricianPatrol.js', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
  const { useElectricianPatrol } = module.exports;
  let state;
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  let props = { enabled: true, cityId: 64, municipalityId: 'city', position, paused: false, revision: 0, filters: { ...patrol.DEFAULT_PATROL_FILTERS, order: 'oldest' } };
  function Harness() { state = useElectricianPatrol(props); return null; }
  return {
    queries, cache,
    get state() { return state; },
    async render(changes = {}) { props = { ...props, ...changes }; flushSync(() => root.render(React.createElement(Harness))); await settle(); await settle(); },
    async act(action) { flushSync(() => action(state)); await settle(); },
    close() { flushSync(() => root.unmount()); node.remove(); },
  };
}

test('ronda mantém o destino antigo, alerta só nesse poste e não avança ao fechar o formulário', async () => {
  const app = setup();
  try {
    await app.render();
    assert.equal(app.state.target.pole.id, 2);
    assert.equal(app.state.alert, null, 'o poste próximo fora da vez não interrompe o trajeto');
    assert.equal(app.state.loading, false);
    assert.ok(app.queries.every(q => !q.calls.some(([name]) => ['gte', 'lte'].includes(name))), 'a busca não fica limitada ao entorno');
    const calls = app.queries.length;
    await app.render({ position: { ...position, lat: pole(2, 845).latitude } });
    assert.equal(app.state.target.pole.id, 2);
    assert.equal(app.state.alert.pole.id, 2);
    assert.equal(app.queries.length, calls, 'movimento não refaz a consulta municipal');
    await app.act(state => state.hideAlert());
    await app.render({ paused: true });
    await app.render({ paused: false });
    assert.equal(app.state.target.pole.id, 2);
    assert.equal(app.state.alert, null);
    await app.act(state => state.complete(2));
    assert.equal(app.state.target.pole.id, 1);
    await app.render({ revision: 1 });
    assert.equal(app.state.target.pole.id, 1, 'a atualização não recoloca o poste atendido na fila');
    await app.act(state => state.dismiss());
    assert.equal(app.state.target, null);
  } finally { app.close(); }
});

test('mais próximos mantém o poste escolhido durante o deslocamento e reinicia ao mudar filtros', async () => {
  const app = setup();
  try {
    await app.render({ filters: patrol.DEFAULT_PATROL_FILTERS });
    assert.equal(app.state.target.pole.id, 1);
    await app.render({ position: { ...position, lat: pole(2, 845).latitude } });
    assert.equal(app.state.target.pole.id, 1);
    await app.render({ position: { ...position, accuracy: 50 } });
    assert.equal(app.state.target.pole.id, 1);
    assert.equal(app.state.alert, null);
    await app.render({ position, filters: { ...patrol.DEFAULT_PATROL_FILTERS, order: 'oldest' } });
    assert.equal(app.state.target.pole.id, 2);
    await app.render({ filters: { ...patrol.DEFAULT_PATROL_FILTERS, neighborhood: 'Outro' } });
    assert.equal(app.state.target, null);
  } finally { app.close(); }
});

test('GPS inicialmente fraco mantém os postes disponíveis no mapa sem antecipar destino ou alerta', async () => {
  const app = setup();
  try {
    await app.render({ position: { ...position, accuracy: 300 } });
    assert.equal(app.state.loading, false);
    assert.deepEqual(app.state.poles.map(p => p.id), [1, 2]);
    assert.equal(app.state.target, null);
    assert.equal(app.state.alert, null);
    await app.render({ position });
    assert.equal(app.state.target.pole.id, 2);
    assert.deepEqual(app.state.poles.map(p => p.id), [1, 2], 'selecionar um destino mantém os outros postes no mapa');
    await app.render({ position: { ...position, accuracy: 300 } });
    assert.equal(app.state.target.pole.id, 2);
    assert.deepEqual(app.state.poles.map(p => p.id), [1, 2]);
    assert.equal(app.state.alert, null);
    await app.act(state => state.complete(2));
    assert.deepEqual(app.state.poles.map(p => p.id), [1]);
  } finally { app.close(); }
});

test('sem rede preserva a prioridade das solicitações guardadas e pagina os candidatos', async () => {
  const cached = { poles: [pole(1, 4), pole(2, 850)], services: [{ pole_id: 1, created_at: '2026-01-01' }, { pole_id: 2, created_at: '2020-01-01' }] };
  const offline = setup({ cached, failure: { message: 'Failed to fetch' } });
  try {
    await offline.render();
    assert.equal(offline.state.target.pole.id, 2);
    assert.match(offline.state.error, /Sem conexão/);
  } finally { offline.close(); }
  const paginated = setup({ rows: Array.from({ length: 502 }, (_, i) => pole(i + 1, i * 10)) });
  try {
    await paginated.render();
    assert.equal(paginated.state.poles.length, 502);
    assert.ok(paginated.queries.some(q => q.table === 'poles' && q.calls.some(([name, start]) => name === 'range' && start === 500)));
  } finally { paginated.close(); }
});
