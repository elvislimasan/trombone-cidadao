import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { legacyGuideRoute } from '../lib/legacyGuideRoute.js';
import { legacyCouncilorRoute } from '../lib/legacyCouncilorRoute.js';
import * as streetHistory from '../lib/pavementStreetHistory.js';
const { cidadeDoAutor, rotaDoVereador } = streetHistory;

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const directives = read('public/.htaccess').split('\n').map((line) => line.trim());

// Avalia o subconjunto de mod_rewrite usado neste arquivo; não substitui Apache.
function route(input, agent, { file = false, directory = false, host = 'trombonecidadao.com.br' } = {}) {
  const url = new URL(input, `https://${host}`);
  const path = url.pathname;
  let conditions = [];
  let conditionMatch = null;
  for (const line of directives) {
    const condition = line.match(/^RewriteCond %\{(HTTP_USER_AGENT|REQUEST_FILENAME|HTTP_HOST|QUERY_STRING)\} (\S+)(?: (\[.*\]))?$/);
    if (condition) {
      const [, variable, pattern, flags = ''] = condition;
      if (variable === 'REQUEST_FILENAME') {
        assert.ok(['-f', '-d', '!-f', '!-d'].includes(pattern), `Condição não suportada: ${pattern}`);
        conditions.push(({ '-f': file, '-d': directory, '!-f': !file, '!-d': !directory })[pattern]);
      } else {
        const value = { HTTP_USER_AGENT: agent, HTTP_HOST: url.hostname, QUERY_STRING: url.search.slice(1) }[variable];
        conditionMatch = new RegExp(pattern, flags.includes('NC') ? 'i' : '').exec(value);
        conditions.push(Boolean(conditionMatch));
      }
      continue;
    }
    const rule = line.match(/^RewriteRule (\S+) (\S+) \[(.*)\]$/);
    if (!rule) continue;
    const [, pattern, destination, flags] = rule;
    const match = new RegExp(pattern).exec(path.replace(/^\//, ''));
    const applies = conditions.every(Boolean) && match;
    conditions = [];
    const captured = conditionMatch;
    conditionMatch = null;
    if (applies && flags.split(',').includes('L')) {
      if (flags.includes('R=404')) return '404';
      const target = destination === '-' ? path : destination
        .replace('%{REQUEST_URI}', path)
        .replace(/%(\d+)/g, (_, index) => captured?.[index] || '')
        .replace(/\$(\d+)/g, (_, index) => match[index] || '');
      return flags.includes('R=') && !target.includes('?') ? `${target}${url.search}` : target;
    }
  }
  return path;
}

test('buscadores acessam as páginas no domínio, sem redirecionamento de prévia', () => {
  const pages = ['/bronca/abc', '/abaixo-assinado/abc', '/guia-da-cidade', '/guia-da-cidade/categoria/abc', '/guia-da-cidade/guia/abc', '/u/maria', '/@maria', '/maria', '/vereadores/floresta/maria', '/noticias/abc', '/obras-publicas/abc'];
  for (const agent of ['Mozilla/5.0', 'Googlebot', 'Googlebot Smartphone', 'Google-InspectionTool', 'bingbot', 'Applebot', 'YandexBot', 'DuckDuckBot', 'Baiduspider']) {
    for (const page of pages) assert.equal(route(page, agent), 'index.html', `${agent}: ${page}`);
  }
});

test('URLs antigas do guia redirecionam preservando categoria, cidade e detalhes', () => {
  const category = '97fd7528-3ffe-4426-85ee-8e5294799c6f';
  const item = '41dc64af-f458-406a-8ae4-46d423e93788';
  for (const agent of ['Googlebot', 'Mozilla/5.0', 'WhatsApp']) {
    assert.equal(route(`/servicos?categoria=${category}&cidade=todas`, agent), `/guia-da-cidade/categoria/${category}?categoria=${category}&cidade=todas`);
    assert.equal(route(`/servicos/guia/${item}`, agent), `/guia-da-cidade/guia/${item}`);
    assert.equal(route('/guiadacidade?cidade=64', agent), '/guia-da-cidade?cidade=64');
    assert.equal(route('/servicos/gerenciar', agent), 'index.html');
  }
  assert.deepEqual(legacyGuideRoute({ pathname: '/servicos', search: `?categoria=${category}&cidade=todas&utm_source=teste`, hash: '#locais' }), {
    pathname: `/guia-da-cidade/categoria/${category}`, search: '?cidade=todas&utm_source=teste', hash: '#locais',
  });
  assert.equal(legacyGuideRoute({ pathname: `/servicos/guia/${item}` }).pathname, `/guia-da-cidade/guia/${item}`);
});

test('www preserva o caminho e a query; endpoint técnico retorna 404 real', () => {
  assert.equal(route('https://www.trombonecidadao.com.br/embaixador?origem=link', 'Googlebot'), 'https://trombonecidadao.com.br/embaixador?origem=link');
  assert.equal(route('/embaixador', 'Googlebot'), 'index.html');
  for (const agent of ['Googlebot', 'Mozilla/5.0']) {
    assert.equal(route('/cdn-cgi/l/email-protection', agent), '404');
    assert.equal(route('/cdn-cgi/l/email-protection/', agent), '404');
  }
});

test('ponto turístico migrado aponta para o cadastro público correspondente', () => {
  const source = '/guia-da-cidade/ponto-turistico/3005f403-faf2-4c02-a670-160cd858d9e5';
  const destination = '/guia-da-cidade/guia/e1be8ebc-ce63-4a5d-a29d-dbf023542231';
  for (const agent of ['Googlebot', 'Mozilla/5.0', 'WhatsApp']) {
    assert.equal(route(`${source}?origem=link`, agent), `${destination}?origem=link`);
  }
  assert.equal(route(destination, 'Googlebot'), 'index.html');
  assert.equal(route('/guia-da-cidade/ponto-turistico/outro', 'Googlebot'), 'index.html');
});

test('links legislativos nunca contêm cidade null ou indefinida nem adivinham cidades', () => {
  for (const city of [null, undefined, '', 'null', 'undefined', 0, 'NaN', 'todas', '64/abc']) assert.equal(rotaDoVereador(city, 'Gilberto Quirino de Sá'), null);
  assert.equal(rotaDoVereador(64, 'Gilberto Quirino de Sá'), '/vereadores/64/gilberto-quirino-de-sa');
  const street = (city_id) => ({ city_id, historical_documents: [{ kind: 'projeto_lei', councilor_author: 'Gilberto Quirino de Sá' }] });
  assert.equal(cidadeDoAutor([street(64), street(64)], 'Gilberto Quirino de Sá'), '64');
  assert.equal(cidadeDoAutor([street(64), street(65)], 'Gilberto Quirino de Sá'), null);
  assert.equal(cidadeDoAutor([street(null), street(64)], 'Gilberto Quirino de Sá'), null);
});

test('link legislativo antigo só é recuperado quando o slug identifica uma cidade única', async () => {
  function client(result) {
    return { from(table) {
      assert.equal(table, 'councilors');
      return { select(columns) {
        assert.equal(columns, 'city_id, slug');
        return { eq(field, slug) {
          assert.equal(field, 'slug'); assert.equal(slug, 'gilberto-quirino-de-sa');
          return { limit(count) { assert.equal(count, 2); return Promise.resolve(result); } };
        } };
      } };
    } };
  }
  const record = { city_id: 64, slug: 'gilberto-quirino-de-sa' };
  assert.equal(await legacyCouncilorRoute(client({ data: [record] }), record.slug), '/vereadores/64/gilberto-quirino-de-sa');
  for (const result of [{ data: [] }, { data: [record, { ...record, city_id: 65 }] }]) {
    assert.equal(await legacyCouncilorRoute(client(result), record.slug), null);
  }
  await assert.rejects(legacyCouncilorRoute(client({ error: { message: 'Falha' } }), record.slug), { message: 'Falha' });
});

test('cards sem cidade mantêm o conteúdo sem criar links inválidos', () => {
  const require = createRequire(import.meta.url);
  const React = require('react');
  const { renderToString } = require('react-dom/server');
  function load(path) {
    const code = ts.transpileModule(read(path), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    const mocks = {
      '@/lib/pavementStreetHistory': streetHistory,
      '@/lib/customSupabaseClient': { supabase: {} },
      'react-router-dom': { Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) },
    };
    new Function('require', 'module', 'exports', code)((name) => mocks[name] || require(name), module, module.exports);
    return module.exports.default;
  }
  const Attribution = load('src/components/pavement/CouncilorAttributionCard.jsx');
  const Ranking = load('src/components/pavement/CouncilorRankingCard.jsx');
  const street = { city_id: null, name: 'Rua Exemplo', historical_documents: [{ kind: 'projeto_lei', councilor_author: 'Gilberto Quirino de Sá' }] };
  for (const element of [React.createElement(Attribution, { street }), React.createElement(Ranking, { streets: [street], cityId: null })]) {
    const html = renderToString(element);
    assert.match(html, /Gilberto Quirino de Sá/);
    assert.doesNotMatch(html, /<a\b|\/vereadores\/null/);
  }
  assert.match(renderToString(React.createElement(Ranking, { streets: [{ ...street, city_id: 64 }], cityId: null })), /href="\/vereadores\/64\/gilberto-quirino-de-sa"/);
});

test('arquivos estáticos e de indexação não viram perfis, inclusive sem arquivo presente', () => {
  for (const agent of ['Googlebot', 'WhatsApp', 'facebookexternalhit']) {
    for (const path of ['/robots.txt', '/sitemap.xml']) {
      assert.equal(route(path, agent), path);
      assert.equal(route(path, agent, { file: true }), path);
    }
    for (const path of ['/manifest.json', '/logo.png', '/sw.js']) {
      assert.equal(route(path, agent, { file: true }), path);
    }
  }
});

test('compartilhamentos continuam recebendo prévias sociais de produção', () => {
  for (const agent of ['WhatsApp', 'facebookexternalhit', 'Twitterbot', 'TelegramBot', 'Discordbot', 'Slackbot', 'LinkedInBot']) {
    assert.match(route('/bronca/abc', agent), /share-preview\?id=abc$/);
    assert.match(route('/guia-da-cidade', agent), /share-city-guide\?type=index$/);
    assert.match(route('/maria', agent), /share-public-profile\?username=maria$/);
  }
  assert.match(route('/share/bronca/abc', 'Mozilla/5.0'), /share-preview\?id=abc$/);
});

test('robots anuncia um sitemap XML com rotas públicas existentes e sem duplicatas', () => {
  assert.match(read('public/robots.txt'), /^Sitemap: https:\/\/trombonecidadao\.com\.br\/sitemap\.xml$/m);
  const xml = read('public/sitemap.xml');
  assert.equal(XMLValidator.validate(xml), true);
  const urls = new XMLParser().parse(xml).urlset.url.map(({ loc }) => loc);
  assert.equal(new Set(urls).size, urls.length);
  const routes = [...read('src/App.jsx').matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]);
  for (const url of urls) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://trombonecidadao.com.br');
    assert.ok(routes.some((route) => !route.includes('*') && new RegExp(`^${route.split('/').map((segment) => segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/')}$`).test(parsed.pathname)), parsed.pathname);
    assert.doesNotMatch(parsed.pathname, /^\/(admin|prefeitura|share|perfil|login)(\/|$)/);
  }
});

test('SEO declara a URL canônica da página e só aplica noindex quando solicitado', () => {
  const require = createRequire(import.meta.url);
  const React = require('react');
  const { renderToString } = require('react-dom/server');
  const { Helmet } = require('react-helmet');
  const source = read('src/components/DynamicSeo.jsx').replaceAll('import.meta.env', '({ VITE_SUPABASE_URL: "https://example.supabase.co" })');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => name === '@capacitor/core' ? { Capacitor: { isNativePlatform: () => false } } : require(name), module, module.exports);
  const SEO = module.exports.default;
  for (const robots of [undefined, 'noindex']) {
    renderToString(React.createElement(SEO, {
      title: 'Bronca', description: 'Descrição', url: 'https://trombonecidadao.com.br/bronca/abc', robots,
    }));
    const head = Helmet.renderStatic();
    assert.match(head.link.toString(), /rel="canonical" href="https:\/\/trombonecidadao.com.br\/bronca\/abc"/);
    assert.equal(head.meta.toString().includes('name="robots" content="noindex"'), robots === 'noindex');
  }
});
