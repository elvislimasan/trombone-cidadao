import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { resolveReportPoleAddress } from '../lib/reportPoleAddress.js';

const location = { lat: -8.6, lng: -38.58 };
function client({ stored = null, mapped = null, storedError = false, mappedError = false } = {}) {
  const calls = [];
  const db = {
    from(table) {
      calls.push(table);
      const query = { select() { return this; }, eq() { return this; }, async maybeSingle() {
        if (storedError) throw new Error('Leitura indisponível');
        return { data: stored, error: null };
      } };
      return query;
    },
    rpc(name) {
      calls.push(name);
      return { async maybeSingle() {
        return { data: mapped, error: mappedError ? { message: 'RPC indisponível' } : null };
      } };
    },
    functions: { invoke() {} },
  };
  return { db, calls };
}

test('seleção com lista antiga recupera endereço já salvo pelo backfill sem geocodificar', async () => {
  const view = client({ stored: { address: ' Rua cadastrada ', city_id: '64' } });
  assert.deepEqual(await resolveReportPoleAddress(view.db, 5, location, {
    lookup: () => assert.fail('Não deve geocodificar endereço cadastrado'),
  }), { address: 'Rua cadastrada', city_id: '64' });
  assert.deepEqual(view.calls, ['poles']);
});

test('poste sem endereço cadastrado usa rua mapeada quando disponível', async () => {
  const view = client({ mapped: { address: ' Rua mapeada ' } });
  assert.deepEqual(await resolveReportPoleAddress(view.db, 5, location, {
    lookup: () => assert.fail('Não deve geocodificar rua mapeada'),
  }), { address: 'Rua mapeada' });
  assert.deepEqual(view.calls, ['poles', 'mapped_street_address_for_pole']);
});

test('ausência de rua mapeada ou falha de RPC consulta a coordenada exata do poste', async () => {
  for (const options of [{}, { storedError: true, mappedError: true }]) {
    const view = client(options);
    const result = await resolveReportPoleAddress(view.db, 5, location, { lookup: async point => {
      assert.deepEqual(point, location);
      return { address: 'Rua geocodificada', city: 'Floresta', state_uf: 'PE' };
    } });
    assert.equal(result.address, 'Rua geocodificada');
    assert.deepEqual(view.calls, ['poles', 'mapped_street_address_for_pole']);
  }
});

test('falha de todas as fontes permite endereço manual e coordenada inválida não inicia consulta', async () => {
  const view = client();
  assert.equal(await resolveReportPoleAddress(view.db, 5, location, {
    lookup: async () => { throw new Error('Sem rede'); },
  }), null);
  view.calls.length = 0;
  assert.equal(await resolveReportPoleAddress(view.db, 5, { lat: NaN, lng: -38 }), null);
  assert.deepEqual(view.calls, []);
});

// Exercita os handlers e o efeito reais do modal, controlando apenas o relógio
// e as respostas de rede para reproduzir seleção/edição durante uma consulta.
const source = fs.readFileSync(new URL('../components/ReportModal.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ReportModal.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let selectSource, effectSource;
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handlePoleSelect') selectSource = node.initializer.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('await resolveReportPoleAddress')) effectSource = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}; visit(ast);
assert.ok(selectSource); assert.ok(effectSource);
const evaluate = (code, bindings) => new Function(...Object.keys(bindings), `return (${code});`)(...Object.values(bindings));

function modal(overrides = {}) {
  const busy = [], failures = [], scheduled = [];
  let state = { category: 'iluminacao', pole_id: 5, address: '', location, title: 'Lâmpada apagada' };
  let nearby = [];
  const bindings = {
    formData: state,
    addressTouchedRef: { current: false }, userPickedLocationRef: { current: false },
    reverseGeocodeTargetRef: { current: null }, lastReverseGeocodeKeyRef: { current: null },
    setIsAddressLookupLoading: value => busy.push(value), setAddressLookupFailed: value => failures.push(value),
    setFormData: update => { state = update(state); bindings.formData = state; },
    setNearbyPoles: update => { nearby = update(nearby); }, setErrors() {}, resetCityCache() {},
    formatPoleLabel: value => String(value),
    supabase: { rpc: async () => ({ data: '64' }), functions: { invoke() {} } },
    resolveReportPoleAddress: async () => ({ address: 'Rua encontrada', city_id: 64 }),
    reverseGeocodePin: () => assert.fail('Poste selecionado usa o resolvedor de poste'),
    setTimeout: callback => { scheduled.push(callback); return callback; }, clearTimeout() {},
    ...overrides,
  };
  return { bindings, busy, failures, scheduled, state: () => state,
    select: pole => evaluate(selectSource, bindings)(pole), start: () => evaluate(effectSource, bindings)() };
}

test('endereço recebido na seleção encerra busca imediatamente e preserva cidade do poste', () => {
  const view = modal();
  view.select({ id: 5, location, data: { address: ' Rua cadastrada ', city_id: '64', identifier: 'X5' } });
  view.start();
  assert.equal(view.state().address, 'Rua cadastrada');
  assert.equal(view.state().city_id, 64);
  assert.ok(view.busy.every(value => value === false));
  assert.equal(view.scheduled.length, 0);
});

test('endereço e cidade geocodificados entram juntos e a busca libera o formulário', async () => {
  const view = modal({ resolveReportPoleAddress: async () => ({ address: 'Rua encontrada', city: 'Floresta', state_uf: 'PE' }) });
  view.start(); await view.scheduled[0]();
  assert.equal(view.state().address, 'Rua encontrada');
  assert.equal(view.state().city_id, 64);
  assert.deepEqual(view.busy, [true, false]);
  assert.deepEqual(view.failures, [false]);
});

test('erro inesperado encerra carregamento e mantém os demais campos', async () => {
  const view = modal({ resolveReportPoleAddress: async () => { throw new Error('Sem rede'); } });
  view.start(); await view.scheduled[0]();
  assert.equal(view.state().title, 'Lâmpada apagada');
  assert.deepEqual(view.busy, [true, false]);
  assert.deepEqual(view.failures, [true]);
});

test('trocar poste durante a consulta impede resposta anterior de preencher o novo poste', async () => {
  let finish;
  const view = modal({ resolveReportPoleAddress: () => new Promise(resolve => { finish = resolve; }) });
  const cleanup = view.start(); const pending = view.scheduled[0]();
  cleanup(); view.select({ id: 6, location: { lat: -8.7, lng: -38.59 }, data: { address: 'Rua do novo poste', identifier: 'X6' } });
  finish({ address: 'Rua do poste anterior', city_id: 99 }); await pending;
  assert.equal(view.state().pole_id, 6);
  assert.equal(view.state().address, 'Rua do novo poste');
  assert.notEqual(view.state().city_id, 99);
});

test('endereço digitado durante a consulta prevalece sobre o resultado automático', async () => {
  let finish;
  const view = modal({ resolveReportPoleAddress: () => new Promise(resolve => { finish = resolve; }) });
  view.start(); const pending = view.scheduled[0]();
  view.bindings.addressTouchedRef.current = true;
  view.bindings.setFormData(prev => ({ ...prev, address: 'Rua conferida manualmente' }));
  finish({ address: 'Rua automática', city_id: 64 }); await pending;
  assert.equal(view.state().address, 'Rua conferida manualmente');
  assert.equal(view.busy.at(-1), false);
});
