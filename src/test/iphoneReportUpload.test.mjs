import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { anonymousReportError } from '../lib/anonymousReportError.js';

const source = fs.readFileSync(new URL('../components/ReportModal.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ReportModal.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
function handler(name, bindings) {
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(initializer, `${name} encontrado`);
  // Apenas a configuração Vite é substituída; o fluxo executado é o do componente.
  initializer = initializer.replace(/import\.meta\.env\.VITE_RECAPTCHA_SITE_KEY/g, '"test-site-key"');
  // eslint-disable-next-line no-new-func -- Executa o handler real extraído da AST, com dependências controladas.
  return new Function(...Object.keys(bindings), `return (${initializer});`)(...Object.values(bindings));
}

function fixture({ photos, queueFails = false, createFails = false, functionError = null, cityId = 64 } = {}) {
  const queued = [], saved = [], notices = [], events = [], calls = [], captchaValues = [], captchaResets = [];
  const formData = {
    title: 'Buraco na rua', category: 'buracos', location: { lat: -8.6, lng: -38.5 },
    photos: photos || [{ name: 'IMG_1.jpg', nativePath: 'file:///cache/IMG_1.jpg', file: null }], videos: [],
  };
  const bindings = {
    formData, user: { id: 'user-1' }, anonymousReportError,
    throwIfSubmissionAborted: signal => { if (signal?.aborted) throw new Error('cancelado'); },
    rememberReport: async report => saved.push(report),
    queueReportMedia: async (source, report) => { queued.push({ source, report }); if (queueFails) throw new Error('queue failed'); },
    supabase: { functions: { invoke: async (name, { body }) => {
      calls.push({ name, body });
      return functionError ? { error: functionError } : createFails ? { error: new Error('create failed') } : { data: { id: 'anonymous-1', protocol: 'TROMB-1', recoveryToken: 'private-capability' } };
    } } },
    isAnonymousCityAllowed: true, validateStep: () => true, setWizardStep() {},
    anonCaptchaValue: 'captcha', uploadAbortControllerRef: { current: null }, setIsSubmitting() {}, setUploadProgress() {},
    reportLocationForSubmit: async () => ({ location: formData.location, city_id: cityId, neighborhood: 'Centro' }),
    showAppError: notice => notices.push(notice), clearReportDraft: () => events.push('draft-cleared'),
    setAnonCaptchaValue: value => captchaValues.push(value), anonRecaptchaRef: { current: { reset: () => captchaResets.push(true) } }, updateSubmissionLock() {},
    window: { dispatchEvent: event => events.push(event.type) },
    CustomEvent: class { constructor(type) { this.type = type; } },
    handleClose: () => events.push('closed'),
  };
  return { queued, saved, notices, events, calls, captchaValues, captchaResets,
    logged: () => handler('uploadMedia', bindings)('report-1'),
    anonymous: () => handler('handleAnonymousSubmit', bindings)(),
  };
}

test('logado iOS guarda caminhos para envio independente sem ler arquivos na WebView', async () => {
  const view = fixture();
  assert.deepEqual(await view.logged(), { success: true });
  assert.equal(view.queued[0].source.nativePath, 'file:///cache/IMG_1.jpg');
  assert.equal(view.queued[0].report.reportId, 'report-1');
  assert.equal(view.queued[0].report.ownerId, 'user-1');
});

test('anônimo salva a bronca antes de enfileirar fotos e mantém autorização para recuperação', async () => {
  const view = fixture({ photos: [{ name: '1.jpg', nativePath: '/cache/1.jpg' }, { name: '2.jpg', nativePath: '/cache/2.jpg' }] });
  await view.anonymous();
  assert.equal(view.calls[0].body.deferMedia, true);
  assert.deepEqual(view.calls[0].body.media, []);
  assert.equal(view.queued.length, 2);
  assert.ok(view.queued.every(item => item.report.recoveryToken === 'private-capability'));
  assert.ok(view.events.includes('closed'));
  assert.deepEqual(view.notices, []);
});

test('anônimo pode registrar sem imagem e adicionar fotos depois neste aparelho', async () => {
  const view = fixture({ photos: [] });
  await view.anonymous();
  assert.deepEqual(view.queued, []);
  assert.equal(view.saved[0].reportId, 'anonymous-1');
  assert.ok(view.events.includes('report-submitted'));
});

test('erro ao criar bronca não enfileira anexos nem apaga o rascunho', async () => {
  const view = fixture({ createFails: true });
  await view.anonymous();
  assert.deepEqual(view.queued, []);
  assert.deepEqual(view.saved, []);
  assert.equal(view.notices.length, 1);
  assert.ok(!view.events.includes('draft-cleared'));
  assert.deepEqual(view.captchaValues, [null]);
  assert.equal(view.captchaResets.length, 1);
});

test('erro HTTP mostra o motivo retornado pela função e renova o captcha para tentar novamente', async () => {
  const response = Response.json({ error: 'recaptcha_failed' }, { status: 400 });
  const view = fixture({ functionError: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: response }) });
  await view.anonymous();
  assert.match(view.notices[0].description, /validar o reCAPTCHA/);
  assert.doesNotMatch(view.notices[0].description, /non-2xx/);
  assert.equal(view.captchaResets.length, 1);
  assert.equal(response.bodyUsed, false);
  assert.ok(!view.events.includes('draft-cleared'));
});

test('não consome nem limpa captcha quando a cidade falha antes da chamada da função', async () => {
  const view = fixture({ cityId: null });
  await view.anonymous();
  assert.deepEqual(view.calls, []);
  assert.deepEqual(view.captchaResets, []);
  assert.deepEqual(view.captchaValues, []);
});
