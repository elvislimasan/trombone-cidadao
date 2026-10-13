import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { fetchPublicDetail } from '../lib/publicDetailResource.js';

test('somente consulta bem-sucedida sem registro significa conteúdo indisponível', async () => {
  assert.equal((await fetchPublicDetail(async () => ({ data: null, error: null }))).status, 'missing');
  const record = { id: 'publico', title: 'Conteúdo público' };
  const result = await fetchPublicDetail(async () => ({ data: record, error: null }));
  assert.equal(result.status, 'ready');
  assert.equal(result.data, record);
  for (const error of [{ code: 'PGRST116' }, { code: '42501' }, { message: 'Failed to fetch' }]) {
    const failed = await fetchPublicDetail(async () => ({ data: null, error }));
    assert.equal(failed.status, 'error');
    assert.equal(failed.error, error);
  }
  assert.equal((await fetchPublicDetail(async () => { throw new Error('Rede indisponível'); })).status, 'error');
});

test('falha permite tentar novamente na mesma página; apenas ausência recebe noindex', () => {
  const require = createRequire(import.meta.url);
  const React = require('react');
  const { renderToString } = require('react-dom/server');
  const { Helmet } = require('react-helmet');
  const code = ts.transpileModule(readFileSync(new URL('../components/PublicDetailState.jsx', import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const mocks = {
    'react-router-dom': { Link: ({ to, children }) => React.createElement('a', { href: to }, children) },
    '@/components/ui/button': { Button: ({ children, asChild, variant, ...props }) => asChild ? children : React.createElement('button', props, children) },
  };
  new Function('require', 'module', 'exports', code)((name) => mocks[name] || require(name), module, module.exports);
  const State = module.exports.default;
  for (const status of ['loading', 'error', 'missing']) {
    const html = renderToString(React.createElement(State, { status, label: 'Notícia', backTo: '/noticias', onRetry: () => {} }));
    const head = Helmet.renderStatic().meta.toString();
    assert.equal(head.includes('noindex'), status === 'missing');
    assert.equal(html.includes('Tentar novamente'), status === 'error');
    if (status !== 'loading') assert.match(html, /href="\/noticias"/);
    assert.doesNotMatch(html, /http-equiv|window\.location/);
  }
});
