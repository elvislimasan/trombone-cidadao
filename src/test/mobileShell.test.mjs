import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as mobileNavigation from '@/lib/mobileNavigation';

const require = createRequire(import.meta.url);
const win = new Window({ url: 'https://app.example.test/' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
}
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const router = require('react-router-dom');
let isNative = true;
let compactPreview = false;
const load = (file, mocks = {}) => {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports;
};
const native = load('../contexts/NativeUIModeContext.jsx', { '@capacitor/core': { Capacitor: { isNativePlatform: () => isNative } } });
const header = load('../contexts/MobileHeaderContext.jsx');
const MobileHeader = load('../components/MobileHeader.jsx', {
  '@/contexts/NativeUIModeContext': { useNativeUIMode: () => ({ ...native.useNativeUIMode(), isInteractive: compactPreview && isNative }) },
  '@/contexts/MobileHeaderContext': header,
  '@/lib/mobileNavigation': mobileNavigation,
  '@/lib/customSupabaseClient': { supabase: { from: () => ({ select() { return this; }, eq() { return this; }, async single() { return { data: null }; } }) } },
  '@/components/Notifications': { __esModule: true, default: () => React.createElement('button', { 'aria-label': 'Notificações' }, 'Avisos') },
  '@/components/ui/button': { Button: ({ variant, size, ...props }) => React.createElement('button', props) },
}).default;
const PreferencesPage = load('../pages/NativePreferencesPage.jsx').default;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 5)); flushSync(() => {}); };

async function render(Component, task, path = '/') {
  const node = document.createElement('div');
  document.body.appendChild(node);
  const root = createRoot(node);
  let navigate;
  let currentPath;
  function Observer() {
    navigate = router.useNavigate();
    currentPath = router.useLocation().pathname;
    return React.createElement(Component);
  }
  flushSync(() => root.render(React.createElement(router.MemoryRouter, { initialEntries: [path] },
    React.createElement(native.NativeUIModeProvider, null,
      React.createElement(header.MobileHeaderProvider, null, React.createElement(Observer))))));
  try {
    await task({ node, go: path => flushSync(() => navigate(path)), pathname: () => currentPath });
  } finally {
    flushSync(() => root.unmount());
    node.remove();
    compactPreview = false;
  }
}

test('o app mantém o cabeçalho clássico desde a abertura mesmo com preferência interativa antiga', async () => {
  let snapshot;
  function Probe() { snapshot = native.useNativeUIMode(); return null; }
  win.localStorage.setItem('tc_native_ui_mode', 'interactive');
  isNative = true;
  await render(Probe, async () => {
    assert.equal(snapshot.isNative, true);
    assert.equal(snapshot.isInteractive, false);
    assert.equal(snapshot.mode, 'default');
    await settle();
    assert.equal(snapshot.isInteractive, false);
  });
  isNative = false;
  win.localStorage.setItem('tc_native_ui_mode', 'interactive');
  await render(Probe, async () => {
    assert.equal(snapshot.isInteractive, false);
    assert.equal(snapshot.mode, 'default');
  });
  isNative = true;
});

test('o cabeçalho compacto não aparece na configuração escolhida pelo cliente', async () => {
  await render(MobileHeader, async ({ node }) => {
    assert.equal(node.querySelector('header'), null);
    await settle();
    assert.equal(node.querySelector('header'), null);
  }, '/mapa');
});

test('o mapa principal é raiz e mapa temático mostra título e retorno próprios', async () => {
  compactPreview = true;
  await render(MobileHeader, async ({ node, go }) => {
    assert.equal(node.querySelector('[aria-label="Voltar"]'), null);
    assert.ok(node.querySelector('[aria-label="Buscar na cidade"]'));
    go('/mapa-arborizacao');
    assert.ok(node.textContent.includes('Arborização'));
    assert.ok(node.querySelector('[aria-label="Voltar"]'));
  }, '/mapa');
});

test('ações da página sobrevivem ao primeiro efeito e não vazam para outra rota', async () => {
  compactPreview = true;
  let oldReset;
  const Icon = () => React.createElement('span', null, '★');
  function Page() {
    const { setTitle, setActions, reset } = header.useMobileHeader();
    const path = router.useLocation().pathname;
    React.useEffect(() => {
      if (path === '/noticias/1') {
        oldReset = reset;
        setTitle('Título da notícia');
        setActions([{ key: 'save', icon: Icon, ariaLabel: 'Salvar notícia', onPress() {} }]);
      } else if (path === '/obras-publicas/2') {
        setTitle('Obra da praça');
      }
      return reset;
    }, [path, setTitle, setActions, reset]);
    return React.createElement(MobileHeader);
  }
  await render(Page, async ({ node, go }) => {
    await settle();
    assert.ok(node.textContent.includes('Título da notícia'));
    assert.ok(node.querySelector('[aria-label="Salvar notícia"]'));
    go('/obras-publicas/2');
    assert.equal(node.querySelector('[aria-label="Salvar notícia"]'), null);
    await settle();
    assert.ok(node.textContent.includes('Obra da praça'));
    flushSync(() => oldReset());
    assert.ok(node.textContent.includes('Obra da praça'));
  }, '/noticias/1');
});

test('voltar após link direto de árvore abre a galeria interna', async () => {
  compactPreview = true;
  win.history.replaceState({ idx: 0 }, '');
  await render(MobileHeader, async ({ node, pathname }) => {
    flushSync(() => node.querySelector('[aria-label="Voltar"]').click());
    assert.equal(pathname(), '/arvores-da-comunidade');
  }, '/arvores-da-comunidade/1');
});

test('links da antiga escolha de layout abrem as configurações atuais', async () => {
  await render(PreferencesPage, async ({ pathname }) => {
    await settle();
    assert.equal(pathname(), '/configuracoes');
  }, '/perfil/preferencias');
});
