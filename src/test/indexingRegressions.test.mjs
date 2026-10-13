import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import { fetchPublicDetail } from '../lib/publicDetailResource.js';
import { fetchCouncilorPublicResource } from '../lib/councilorPublicResource.js';
import { guidePageSeo } from '../lib/publicPageSeo.js';
import { legacyCouncilorRoute } from '../lib/legacyCouncilorRoute.js';
import * as history from '../lib/pavementStreetHistory.js';

const require = createRequire(import.meta.url);
const win = new Window({ url: 'https://trombonecidadao.com.br/bronca/abc' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name.includes('AnimationFrame') ? win[name].bind(win) : win[name] });
}
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { Helmet } = require('react-helmet');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const noop = () => {};
const router = { Link: ({ to, children }) => React.createElement('a', { href: to }, children) };
const button = { Button: ({ asChild, children, variant, ...props }) => asChild ? children : React.createElement('button', props, children) };

function load(path, mocks = {}) {
  const source = read(path).replaceAll('import.meta.env', '({VITE_APP_URL:"https://trombonecidadao.com.br",VITE_SUPABASE_URL:"https://example.supabase.co"})');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => mocks[name] || require(name), module, module.exports);
  return module.exports;
}
const State = load('src/components/PublicDetailState.jsx', { 'react-router-dom': router, '@/components/ui/button': button }).default;
const DynamicSEO = load('src/components/DynamicSeo.jsx', { '@capacitor/core': { Capacitor: { isNativePlatform: () => false } } }).default;

function callback(path, name, environment) {
  const ast = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let source;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && ts.isCallExpression(node.initializer)) source = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(source, `${path}: ${name}`);
  return new Function(...Object.keys(environment), `return (${source});`)(...Object.values(environment));
}

function client(handler) {
  return {
    rpc: async () => ({ data: null, error: null }),
    from(table) {
      const filters = {};
      const query = {
        select() { return query; }, eq(field, value) { filters[field] = value; return query; },
        maybeSingle() { return query; }, order() { return query; }, or() { return query; }, limit() { return query; },
        then(resolve, reject) { return Promise.resolve().then(() => handler(table, filters)).then(resolve, reject); },
      };
      return query;
    },
  };
}
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 30));
}
function mount() {
  const node = document.createElement('div'); document.body.appendChild(node);
  const root = createRoot(node);
  return { node, render: (element) => flushSync(() => root.render(element)), close: () => { flushSync(() => root.unmount()); node.remove(); } };
}

test('SEO global e SEO da bronca produzem uma única canônica no DOM e removem noindex após recuperar', async () => {
  const app = read('src/App.jsx');
  const ast = ts.createSourceFile('App.jsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const declaration = ast.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => d.name.getText(ast) === 'SEO'));
  const code = ts.transpileModule(declaration.getText(ast).replaceAll('import.meta.env', '({VITE_APP_URL:"https://trombonecidadao.com.br",VITE_SUPABASE_URL:"https://example.supabase.co"})'), { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText;
  const GlobalSEO = new Function('React', 'Helmet', 'useLocation', 'isReservedUsername', `${code}; return SEO;`)(React, Helmet, () => ({ pathname: '/bronca/abc' }), () => true);
  const view = mount();
  try {
    const page = (status) => React.createElement(React.Fragment, null, React.createElement(GlobalSEO), status === 'ready'
      ? React.createElement(DynamicSEO, { title: 'Título público', description: 'Descrição', url: 'https://trombonecidadao.com.br/bronca/abc' })
      : React.createElement(State, { status, label: 'Bronca', backTo: '/mapa', onRetry: noop }));
    for (const status of ['missing', 'error', 'ready']) {
      view.render(page(status)); await settle();
      assert.equal(document.head.querySelectorAll('link[rel="canonical"]').length, 1);
      assert.equal(Boolean(document.head.querySelector('meta[name="robots"][content="noindex"]')), status === 'missing');
    }
    assert.equal(document.title, 'Título público');
    assert.equal(document.head.querySelector('link[rel="canonical"]').href, 'https://trombonecidadao.com.br/bronca/abc');
    assert.equal(document.head.querySelector('meta[property="al:android:url"]').content, 'trombonecidadao://bronca/abc');
    view.render(React.createElement(React.Fragment, null, React.createElement(GlobalSEO), React.createElement(DynamicSEO, {
      title: 'Obra', description: 'Descrição', url: 'https://trombonecidadao.com.br/obras-publicas/xyz',
    })));
    await settle();
    assert.equal(document.head.querySelectorAll('link[rel="canonical"]').length, 1);
    assert.equal(document.head.querySelector('meta[property="al:ios:url"]').content, 'trombonecidadao://obras-publicas/xyz');
  } finally { view.close(); }
});

test('perfil público mostra erro sem noindex; ausência e privacidade continuam excluídas', async () => {
  const ast = ts.createSourceFile('PublicProfilePage.jsx', read('src/pages/PublicProfilePage.jsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const mocks = {};
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node)) continue;
    const name = node.moduleSpecifier.text;
    if (['react', 'react-helmet'].includes(name)) continue;
    const exports = { __esModule: true, default: () => null };
    for (const binding of node.importClause?.namedBindings?.elements || []) exports[binding.name.text] = noop;
    mocks[name] = exports;
  }
  let resource;
  let retried = 0;
  mocks['react-router-dom'] = { ...router, useParams: () => ({ username: 'maria' }), useNavigate: () => noop };
  mocks['@/components/PublicDetailState'] = { __esModule: true, default: State };
  mocks['@/hooks/usePublicProfile'] = { usePublicProfile: () => ({ ...resource, reports: [], followState: {}, refetchProfile: () => { retried += 1; } }) };
  mocks['@/contexts/SupabaseAuthContext'] = { useAuth: () => ({ user: null }) };
  mocks['@/contexts/CityContext'] = { useCity: () => ({ cities: [] }) };
  mocks['@/lib/username'] = { normalizeUsername: (name) => name, PROFILE_TYPE_INFO: { citizen: {} } };
  const Page = load('src/pages/PublicProfilePage.jsx', mocks).default;
  const view = mount();
  try {
    for (const value of [{ error: 'Falha temporária' }, { profile: null }, { profile: { username: 'maria', public_profile_enabled: false } }]) {
      resource = { loading: false, ...value };
      view.render(React.createElement(Page)); await settle();
      assert.equal(Boolean(document.head.querySelector('meta[name="robots"][content="noindex"]')), !value.error);
      if (value.error) {
        const retry = [...view.node.querySelectorAll('button')].find((node) => node.textContent === 'Tentar novamente');
        assert.ok(retry); retry.click(); assert.equal(retried, 1);
      }
    }
  } finally { view.close(); }
});

test('hook de perfil recupera uma falha de RPC e ignora resposta de outro username', async () => {
  let response = { data: null, error: { message: 'RPC indisponível' } };
  const pending = [];
  const api = { rpc(name, params) {
    if (name !== 'get_public_profile') return Promise.resolve({ data: null });
    if (params.p_username === 'antigo') return new Promise((resolve) => pending.push(resolve));
    return Promise.resolve(response);
  } };
  const { usePublicProfile } = load('src/hooks/usePublicProfile.js', {
    '@/lib/customSupabaseClient': { supabase: api }, '@/lib/username': { normalizeUsername: (name) => name },
    '@/lib/publicDetailResource': { fetchPublicDetail },
  });
  let current;
  function Probe({ username }) { current = usePublicProfile(username); return null; }
  const view = mount();
  try {
    view.render(React.createElement(Probe, { username: 'maria' })); await settle();
    assert.equal(current.error, 'RPC indisponível'); assert.equal(current.loading, false);
    response = { data: { username: 'maria', public_profile_enabled: false }, error: null };
    await current.refetchProfile(); await settle();
    assert.equal(current.error, null); assert.equal(current.profile.username, 'maria');
    view.render(React.createElement(Probe, { username: 'antigo' })); await settle();
    view.render(React.createElement(Probe, { username: 'maria' })); await settle();
    pending[0]({ data: null, error: { message: 'Falha antiga' } }); await settle();
    assert.equal(current.error, null); assert.equal(current.profile.username, 'maria');
  } finally { view.close(); }
});

test('bronca mantém a URL em falha e ausência; nova tentativa recupera o registro', async () => {
  let response = { error: { message: 'Rede indisponível' }, data: null };
  let state; let report;
  const navigations = [];
  const fetch = callback('src/pages/ReportPage.jsx', 'fetchReport', {
    loadRequest: { current: 0 }, reportId: 'abc', user: null,
    setLoadState: (next) => { state = next; }, setLoading: noop, setReport: (next) => { report = next; },
    setReportUpdates: noop, setOfficialSteps: noop, fetchPublicDetail,
    supabase: client((table) => table === 'reports' ? response : { data: [], error: null }),
    navigate: (to) => navigations.push(to), showAppError: noop,
  });
  await fetch(); assert.equal(state.status, 'error');
  response = { data: { id: 'abc', title: 'Bronca pública', location: null }, error: null };
  await fetch(); assert.equal(state.status, 'ready'); assert.equal(report.title, 'Bronca pública');
  response = { data: null, error: null };
  await fetch(); assert.equal(state.status, 'missing'); assert.equal(report, null);
  assert.deepEqual(navigations, []);
});

test('local distingue falha temporária de ausência e recupera na tentativa seguinte', async () => {
  let response = { error: { message: 'Falha de consulta' }, data: null };
  let state; let item;
  const fetch = callback('src/pages/DirectoryDetailsPage.jsx', 'fetchItem', {
    id: 'local', loadRequest: { current: 0 }, setLoadState: (next) => { state = next; },
    setItem: (next) => { item = next; }, setRelated: noop, fetchPublicDetail, guideLocation: () => null,
    supabase: client(() => response),
  });
  await fetch(); assert.equal(state.status, 'error');
  response = { data: { id: 'local', name: 'Local público' }, error: null };
  await fetch(); assert.equal(state.status, 'ready'); assert.equal(item.name, 'Local público');
  response = { data: null, error: null };
  await fetch(); assert.equal(state.status, 'missing');
});

test('vereador só confirma ausência depois de consultar cadastro e autores sem erros', async () => {
  const answers = { councilors: { data: null }, pavement_streets: { data: [] }, cities: { data: { name: 'Floresta' } } };
  const api = client((table) => answers[table]);
  const get = () => fetchCouncilorPublicResource(api, 64, 'maria');
  assert.equal((await get()).status, 'missing');
  answers.councilors = { data: null, error: { message: 'API indisponível' } };
  assert.equal((await get()).status, 'error');
  answers.councilors = { data: { id: 'vereador', city_id: 64, slug: 'maria' } };
  assert.equal((await get()).status, 'ready');
  answers.councilors = { data: null };
  answers.pavement_streets = { data: [{ historical_documents: [{ kind: 'projeto_lei', councilor_author: 'Maria' }] }] };
  const inferred = await get(); assert.equal(inferred.status, 'ready'); assert.equal(inferred.data.councilor.name, 'Maria');
  answers.pavement_streets = { error: { message: 'Ruas indisponíveis' } };
  assert.equal((await get()).status, 'error');
});

test('falha do resolvedor de vereador antigo oferece erro recuperável em vez de ausência', async () => {
  let state;
  const fetch = callback('src/pages/CouncilorProfilePage.jsx', 'load', {
    cityId: 'null', slug: 'maria', resourceKey: 'null/maria', user: null, loadRequest: { current: 0 },
    setLoadState: (next) => { state = next; }, setLegacyPath: noop, setCouncilor: noop,
    cityIdDeVereador: history.cityIdDeVereador, legacyCouncilorRoute, fetchCouncilorPublicResource,
    supabase: client(() => ({ error: { message: 'API indisponível' } })),
  });
  await fetch(); assert.equal(state.status, 'error');
});

test('guia ignora resposta e erro antigos após mudar cidade, inclusive metadados durante carregamento', async () => {
  const requests = [];
  const errors = [];
  const onError = (error) => errors.push(error);
  const api = client((table, filters) => table === 'directory_categories'
    ? { data: [{ id: 'categoria', name: 'Saúde' }] }
    : new Promise((resolve, reject) => requests.push({ city: filters.city_id, resolve, reject })));
  const { useGuideDirectory } = load('src/hooks/useGuideDirectory.js');
  let current;
  function Probe({ cityId }) { current = useGuideDirectory(api, cityId, onError); return null; }
  const view = mount();
  const seo = (cityId) => guidePageSeo({ categoryId: 'categoria', category: current.directoryCategories[0], entries: current.directory, cityId, loading: current.loading, dataReady: current.dataReady });
  try {
    view.render(React.createElement(Probe, { cityId: 64 })); await settle();
    view.render(React.createElement(Probe, { cityId: 65 }));
    assert.equal(current.dataReady, false); assert.deepEqual(current.directory, []); assert.equal(seo(65).robots, undefined);
    await settle();
    requests.find((r) => r.city === '65').resolve({ data: [{ id: 'novo', name: 'Local da cidade 65' }] }); await settle();
    assert.equal(current.dataReady, true); assert.equal(seo(65).robots, undefined);
    requests.find((r) => r.city === '64').resolve({ data: [] }); await settle();
    assert.equal(current.directory[0].id, 'novo'); assert.equal(seo(65).robots, undefined);
    view.render(React.createElement(Probe, { cityId: 66 })); await settle();
    view.render(React.createElement(Probe, { cityId: 67 })); await settle();
    requests.find((r) => r.city === '67').resolve({ data: [] }); await settle();
    assert.equal(seo(67).robots, 'noindex');
    requests.find((r) => r.city === '66').reject(new Error('Falha antiga')); await settle();
    assert.deepEqual(errors, []); assert.equal(seo(67).robots, 'noindex');
    view.render(React.createElement(Probe, { cityId: null })); await settle();
    requests.find((r) => r.city == null).reject(new Error('Falha atual')); await settle();
    assert.equal(current.loading, false); assert.equal(current.dataReady, false); assert.equal(seo(null).robots, undefined);
    assert.equal(errors.length, 1);
  } finally { view.close(); }
});

test.after(async () => { await win.happyDOM.close(); });
