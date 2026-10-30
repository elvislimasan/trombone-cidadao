import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as adoption from '../lib/treeAdoption.js';
import * as pickup from '../lib/treePickup.js';
import { treeNameKey } from '../lib/treeInventory.js';

const require = createRequire(import.meta.url);
const win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
}
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const details = { ...pickup.pickupDetails(), address: 'Rua do Viveiro, 10', schedule: [{ days: [1, 3, 5], from: '08:00', to: '12:00' }] };
const species = [{ id: 's1', city_id: 64, common_name: 'Ipê', scientific_name: 'Handroanthus' }, { id: 's2', city_id: 64, common_name: 'Oiti' }];
let nurseries, availability, writes, failure;
const supabase = { from(table) {
  let payload, filters = [], updating = false;
  const query = {
    insert(value) { payload = value; return query; },
    update(value) { payload = value; updating = true; return query; },
    eq(key, value) { filters.push([key, value]); return query; },
    select() { return query; },
    async single() {
      writes.push({ table, payload, filters, updating });
      if (failure) return { error: failure };
      const row = updating ? { ...nurseries.find(item => item.id === filters.find(([key]) => key === 'id')[1]), ...payload }
        : { id: 'new-nursery', provider: 'new-provider', ...payload };
      nurseries = updating ? nurseries.map(item => item.id === row.id ? row : item) : [...nurseries, row];
      return { data: row, error: null };
    },
    async upsert(rows, options) {
      writes.push({ table, rows, options });
      if (failure) return { error: failure };
      for (const row of rows) {
        availability = [...availability.filter(item => item.species_id !== row.species_id || item.provider !== row.provider), row];
      }
      return { error: null };
    },
  };
  return query;
} };
const mocks = {
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/ui/button': { Button: ({ variant, size, ...props }) => React.createElement('button', props) },
  '@/components/ui/input': { Input: React.forwardRef((props, ref) => React.createElement('input', { ...props, ref })) },
  '@/lib/customSupabaseClient': { supabase },
  '@/hooks/useCanManageArborization': { useCanManageArborization: () => ({ canManage: true }) },
  '@/lib/treeAdoption': adoption,
  '@/lib/treePickup': pickup,
  '@/lib/treeInventory': { treeNameKey },
  './TreePickupFields': { __esModule: true, default: ({ value, onChange, section }) => React.createElement('div', { 'data-testid': 'pickup-fields' },
    section === 'location' && React.createElement('label', {}, 'Endereço do viveiro', React.createElement('input', { 'aria-label': 'Endereço do viveiro', value: value.address, onChange: event => onChange({ address: event.target.value }) })),
    section === 'schedule' && React.createElement('button', { type: 'button', onClick: () => onChange({ schedule: details.schedule }) }, 'Definir dias e horários')) },
  './TreeSpeciesField': { __esModule: true, default: () => null },
};
function load(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
  return module.exports;
}
mocks['./TreeAdoptionAvailabilityList'] = load('../components/arborization/TreeAdoptionAvailabilityList.jsx');
const { default: TreeNurseryManager } = load('../components/arborization/TreeNurseryManager.jsx');
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 50)); flushSync(() => {}); };
function click(text) {
  const button = [...document.querySelectorAll('button')].find(row => row.textContent.trim() === text || row.getAttribute('aria-label') === text);
  assert.ok(button, `Botão ${text}`);
  flushSync(() => button.click());
}
function fill(input, value) {
  assert.ok(input);
  const nativeSet = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
  flushSync(() => {
    nativeSet.call(input, value);
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
}
async function withManager(run, empty = false, fixture = {}) {
  nurseries = fixture.nurseries || (empty ? [] : [{ id: 'n1', provider: 'p1', city_id: 64, name: 'Viveiro municipal', pickup_details: details }]);
  availability = fixture.availability || []; writes = []; failure = null;
  const node = document.createElement('div'); document.body.appendChild(node);
  const root = createRoot(node);
  function Harness() {
    const [, revise] = React.useState(0);
    return React.createElement(TreeNurseryManager, { cityId: 64, city: { id: 64, name: 'Floresta' }, catalog: {
      nurseries, availability, species, loading: false, error: '', refresh: () => revise(value => value + 1),
    } });
  }
  try { flushSync(() => root.render(React.createElement(Harness))); await run(node); }
  finally { flushSync(() => root.unmount()); node.remove(); }
}

test('cadastro começa pelo viveiro e grava local e atendimento uma única vez', async () => {
  await withManager(async node => {
    assert.match(node.textContent, /Cadastre o primeiro viveiro/);
    click('Cadastrar viveiro');
    fill(document.querySelector('input[placeholder="Ex.: Viveiro municipal"]'), 'Viveiro da comunidade');
    fill(document.querySelector('input[aria-label="Endereço do viveiro"]'), 'Rua Nova, 50');
    assert.equal(writes.length, 0);
    click('Continuar');
    click('Definir dias e horários');
    click('Salvar e adicionar espécies'); await settle();
    assert.equal(writes[0].table, 'tree_nurseries');
    assert.equal(writes[0].payload.city_id, 64);
    assert.equal(writes[0].payload.name, 'Viveiro da comunidade');
    assert.equal(writes[0].payload.pickup_details.address, 'Rua Nova, 50');
    assert.deepEqual(writes[0].payload.pickup_details.schedule, details.schedule);
    assert.match(node.textContent, /Selecione as espécies/);
    assert.equal(node.querySelector('.nursery-steps [aria-current]').textContent, '3Espécies');
    click('Adicionar depois');
    assert.match(node.textContent, /Adicione a primeira espécie/);
  }, true);
});

test('vincula várias espécies ao mesmo viveiro sem cadastrar retirada em cada espécie', async () => {
  await withManager(async node => {
    click('Gerenciar viveiro');
    click('Adicionar espécies');
    assert.equal(document.querySelector('[data-testid="pickup-fields"]'), null);
    click('Selecionar todas da busca');
    click('Adicionar 2 espécies'); await settle();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].table, 'tree_species_availability');
    assert.deepEqual(writes[0].options, { onConflict: 'species_id,provider' });
    assert.deepEqual(writes[0].rows, species.map(row => ({ species_id: row.id, nursery_id: 'n1', provider: 'p1', status: 'disponivel' })));
    assert.match(node.textContent, /Ipê/); assert.match(node.textContent, /Oiti/);
    const status = document.querySelector('select[aria-label="Disponibilidade de Ipê"]');
    flushSync(() => { status.value = 'indisponivel'; status.dispatchEvent(new win.Event('change', { bubbles: true })); });
    await settle();
    assert.equal(writes[1].rows.length, 1); assert.equal(writes[1].rows[0].status, 'indisponivel');
    assert.equal(document.querySelector('select[aria-label="Disponibilidade de Ipê"]').value, 'indisponivel');
    assert.equal(node.querySelector('form'), null);
  });
});

test('edição de local e horários grava somente o viveiro e respeita o escopo municipal', async () => {
  await withManager(async node => {
    click('Gerenciar viveiro'); click('Editar viveiro');
    fill(document.querySelector('input[aria-label="Endereço do viveiro"]'), 'Novo local, 100');
    click('Continuar'); click('Salvar alterações'); await settle();
    assert.equal(writes.length, 1); assert.equal(writes[0].table, 'tree_nurseries');
    assert.deepEqual(writes[0].filters, [['id', 'n1'], ['city_id', 64]]);
    assert.equal(writes[0].payload.pickup_details.address, 'Novo local, 100');
    click('Editar viveiro');
    assert.equal(node.querySelector('input[aria-label="Endereço do viveiro"]').value, 'Novo local, 100');
  });
});

test('falha ao vincular espécies preserva seleção, situação e formulário', async () => {
  await withManager(async node => {
    click('Gerenciar viveiro'); click('Adicionar espécies'); click('Selecionar todas da busca');
    failure = new Error('Sem conexão');
    click('Adicionar 2 espécies'); await settle();
    assert.match(node.textContent, /Sua seleção foi mantida/);
    assert.equal(document.querySelectorAll('input[type="checkbox"]:checked').length, 2);
    assert.equal(document.querySelector('input[type="radio"]:checked').value, 'disponivel');
    assert.equal(availability.length, 0);
  });
});

const overviewFixture = {
  nurseries: [
    { id: 'n1', provider: 'p1', name: 'Viveiro central', pickup_details: details },
    { id: 'n2', provider: 'p2', name: 'Viveiro do bairro', pickup_details: { ...details, address: 'Avenida São José, 50' } },
    { id: 'n3', provider: 'p3', name: 'Viveiro sem cadastro completo' },
  ],
  availability: [
    { nursery_id: 'n1', species_id: 's2', provider: 'p1', status: 'sob_consulta' },
    { nursery_id: 'n2', species_id: 's1', provider: 'p2', status: 'disponivel' },
    { nursery_id: 'n2', species_id: 's2', provider: 'p2', status: 'disponivel' },
  ],
};
const visibleNurseries = node => [...node.querySelectorAll('.tree-nursery-card h3')].map(row => row.textContent);
test('disponibilidade muda no card, preserva a situação em caso de falha e permite tentar novamente', async () => {
  await withManager(async node => {
    click('Gerenciar viveiro');
    const select = () => node.querySelector('select[aria-label="Disponibilidade de Oiti"]');
    const change = value => flushSync(() => { select().value = value; select().dispatchEvent(new win.Event('change', { bubbles: true })); });
    failure = new Error('Offline');
    change('indisponivel'); await settle();
    assert.equal(select().value, 'sob_consulta');
    assert.match(node.querySelector('[role="alert"]').textContent, /Tente novamente/);
    assert.equal(availability[0].status, 'sob_consulta');
    failure = null;
    change('disponivel'); await settle();
    assert.equal(select().value, 'disponivel');
    assert.equal(availability[0].status, 'disponivel');
    assert.match(node.textContent, /Disponibilidade atualizada/);
    assert.equal(node.querySelector('form'), null);
    click('Voltar aos viveiros');
    assert.match(node.querySelector('.tree-nursery-card .tree-nursery-badge').textContent, /Com mudas disponíveis/);
  }, false, overviewFixture);
});
function filterNurseries(value) {
  const select = document.querySelector('.tree-nursery-filter select');
  flushSync(() => { select.value = value; select.dispatchEvent(new win.Event('change', { bubbles: true })); });
}

test('filtro compacto encontra oferta e pendências e permite recuperar todos os viveiros', async () => {
  await withManager(async node => {
    filterNurseries('available');
    assert.deepEqual(visibleNurseries(node), ['Viveiro do bairro']);
    filterNurseries('empty');
    assert.deepEqual(visibleNurseries(node), ['Viveiro central', 'Viveiro sem cadastro completo']);
    filterNurseries('incomplete');
    assert.deepEqual(visibleNurseries(node), ['Viveiro sem cadastro completo']);
    assert.match(node.querySelector('.tree-nursery-warning').textContent, /endereço e horários/);
    filterNurseries('unlinked');
    assert.deepEqual(visibleNurseries(node), ['Viveiro sem cadastro completo']);
    click('Limpar filtros');
    assert.equal(visibleNurseries(node).length, 3);
    assert.equal(writes.length, 0);
  }, false, overviewFixture);
});

test('etapas validam o cadastro antes de gravar e preservam os dados ao voltar e tentar novamente', async () => {
  await withManager(async node => {
    click('Cadastrar viveiro');
    fill(node.querySelector('input[placeholder="Ex.: Viveiro municipal"]'), 'Viveiro novo');
    click('Continuar');
    assert.match(node.querySelector('[role="alert"]').textContent, /endereço/);
    assert.equal(writes.length, 0);
    fill(node.querySelector('input[aria-label="Endereço do viveiro"]'), 'Rua das Flores, 20');
    click('Continuar');
    click('Salvar e adicionar espécies');
    assert.match(node.querySelector('[role="alert"]').textContent, /dias e horários/);
    assert.equal(writes.length, 0);
    click('Definir dias e horários');
    click('Voltar');
    assert.equal(node.querySelector('input[placeholder="Ex.: Viveiro municipal"]').value, 'Viveiro novo');
    assert.equal(node.querySelector('input[aria-label="Endereço do viveiro"]').value, 'Rua das Flores, 20');
    click('Continuar');
    failure = new Error('Offline');
    click('Salvar e adicionar espécies'); await settle();
    assert.match(node.querySelector('[role="alert"]').textContent, /Seus dados foram mantidos/);
    failure = null;
    click('Salvar e adicionar espécies'); await settle();
    assert.equal(nurseries.filter(row => row.name === 'Viveiro novo').length, 1);
    assert.match(node.textContent, /Selecione as espécies/);
  });
});

test('busca espécie e endereço sem acentos e mantém a busca ao voltar', async () => {
  await withManager(async node => {
    const searchInput = () => node.querySelector('input[placeholder="Buscar viveiro, endereço ou espécie"]');
    fill(searchInput(), 'ipe');
    assert.deepEqual(visibleNurseries(node), ['Viveiro do bairro']);
    click('Gerenciar viveiro');
    click('Editar viveiro');
    assert.match(node.querySelector('input[aria-label="Endereço do viveiro"]').value, /São José/);
    click('Cancelar');
    click('Voltar aos viveiros');
    assert.equal(searchInput().value, 'ipe');
    assert.deepEqual(visibleNurseries(node), ['Viveiro do bairro']);
    fill(searchInput(), 'sao jose');
    assert.deepEqual(visibleNurseries(node), ['Viveiro do bairro']);
    fill(searchInput(), 'ausente');
    assert.match(node.textContent, /Nenhum viveiro encontrado/);
    click('Ver todos os viveiros');
    assert.equal(visibleNurseries(node).length, 3);
    assert.equal(writes.length, 0);
  }, false, overviewFixture);
});

test('atalho de pendência abre o cadastro correto e voltar preserva o filtro', async () => {
  await withManager(async node => {
    filterNurseries('incomplete');
    flushSync(() => node.querySelector('button.tree-nursery-warning').click());
    assert.equal(node.querySelector('input[placeholder="Ex.: Viveiro municipal"]').value, 'Viveiro sem cadastro completo');
    click('Cancelar');
    assert.match(node.querySelector('.tree-nursery-detail-header').textContent, /Viveiro sem cadastro completo/);
    click('Voltar aos viveiros');
    assert.deepEqual(visibleNurseries(node), ['Viveiro sem cadastro completo']);
    assert.equal(writes.length, 0);
  }, false, overviewFixture);
});
