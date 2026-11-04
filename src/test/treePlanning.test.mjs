import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_TREE, treePayload, filterTrees, treeStats, treesCsv, treeMapMarkerKey } from '../lib/arborization.js';
import { treePlanningRows, treePlanningCsv, treeStreetKey } from '../lib/treePlanning.js';
import { treeNeighborhoodCounts, nearbyTrees, treeReportSelection } from '../lib/treeInventory.js';
import { treeInventoryHighlights } from '../lib/treeSpecies.js';
import { treeBatchPayloads } from '../lib/treeBatchLocations.js';

const base = { ...EMPTY_TREE, common_name: 'Ipê', latitude: '-8.6', longitude: '-38.5', city_id: 64, maintenance_action: 'nenhuma' };
const plan = { ...base, id: 'plan', status: 'planejada', planting_year: 2027, street_id: 's1', street_name: 'Rua das Flores', neighborhood: 'Centro', bairro_id: 'b1' };

test('plantio planejado exige ano, permite planos em atraso e não aceita data realizada', () => {
  assert.throws(() => treePayload({ ...plan, planting_year: '' }, 64), /ano previsto/i);
  for (const year of ['abc', 2027.5, 1899, 10000]) assert.throws(() => treePayload({ ...plan, planting_year: year }, 64), /ano previsto/i);
  assert.equal(treePayload({ ...plan, planting_year: 2020 }, 64).planting_year, 2020);
  assert.throws(() => treePayload({ ...plan, planted_at: '2025-01-01' }, 64), /planejado/i);
  assert.equal(treePayload({ ...plan, height_m: 4, dap_cm: 20, health: 'boa' }, 64).dap_cm, null);
});

test('confirmação do plantio exige data e mantém o ano previsto original', () => {
  assert.throws(() => treePayload({ ...plan, status: 'saudavel' }, 64), /data do plantio realizado/i);
  const result = treePayload({ ...plan, status: 'saudavel', planted_at: '2026-01-01' }, 64);
  assert.equal(result.planting_year, 2027);
  assert.equal(result.planted_at, '2026-01-01');
});

test('vistoria valida DAP, escolhas múltiplas e consistência de pragas e fiação', () => {
  assert.equal(treePayload({ ...base, dap_cm: '22,5', pests: ['cupins', 'fungos'] }, 64).dap_cm, 22.5);
  for (const dap_cm of ['-1', '0', 'abc']) assert.throws(() => treePayload({ ...base, dap_cm }, 64), /DAP/);
  assert.throws(() => treePayload({ ...base, pests: ['nenhuma', 'cupins'] }, 64), /pragas/);
  assert.throws(() => treePayload({ ...base, health: 'unknown' }, 64), /Sanidade/);
  assert.throws(() => treePayload({ ...base, power_lines: 'nenhuma', wire_conflict: 'toca' }, 64), /fiação/);
});

test('planos não inflam árvores vivas, bairros, espécie mais plantada nem seleção de bronca', () => {
  const existing = { ...base, id: 'existing', species_id: 'ip', origin: 'nativa', neighborhood: 'Centro', planted_at: '2026-01-01' };
  const trees = [existing, { ...plan, species_id: 'plan-species' }, { ...plan, id: 'plan2', species_id: 'plan-species' }];
  assert.equal(treeStats(trees).living, 1);
  assert.equal(treeNeighborhoodCounts(trees)[0].count, 1);
  assert.equal(treeInventoryHighlights(trees, [], 2026).mostPlanted.name, 'Ipê');
  assert.deepEqual(nearbyTrees([plan], { lat: -8.6, lng: -38.5 }), []);
  assert.equal(treeReportSelection(plan), null);
  assert.equal(treeMapMarkerKey({ ...plan, service_requests: 1 }, true), 'planejada');
});

test('filtros combinam ano previsto, rua, bairro e tipo sem misturar data realizada', () => {
  const trees = [plan, { ...plan, id: 'other-year', planting_year: 2028 }, { ...base, planted_at: '2027-01-01' }];
  assert.deepEqual(filterTrees(trees, { planningYear: '2027', registration: 'planned', street: treeStreetKey(plan), neighborhood: 'Centro' }).map(tree => tree.id), ['plan']);
  assert.equal(filterTrees(trees, { status: 'living' }).length, 1);
  assert.equal(filterTrees(trees, { search: 'flores' }).length, 2);
});

test('relatório agrega ano, cidade, bairro e rua, separando previstos e realizados', () => {
  const rows = treePlanningRows([plan, { ...plan, id: 'completed', status: 'saudavel', planted_at: '2026-01-01' }, { ...plan, id: 'city2', city_id: 65 }, base]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].planned, 1);
  assert.equal(rows[0].planted, 1);
  assert.equal(treePlanningRows([{ ...plan, planting_year: null }]).length, 0);
  assert.match(treePlanningCsv([plan], [{ id: 64, name: 'Floresta' }]), /Floresta.*2027.*Centro.*Rua das Flores/);
  assert.ok(treePlanningCsv([{ ...plan, street_name: '=HYPERLINK(x)' }]).includes("'=HYPERLINK"));
  assert.match(treesCsv([{ ...base, dap_cm: 22.5, health: 'boa' }]), /Sanidade geral/);
});

test('filtro por rua reúne endereços antigos e vínculos oficiais sem duplicar o relatório', () => {
  const old = { ...plan, id: 'old', street_id: null, street_name: null, address: 'RUA DAS FLORES, 20' };
  assert.equal(filterTrees([old, plan], { street: treeStreetKey(plan) }).length, 2);
  const rows = treePlanningRows([old, plan]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].planned, 2);
});

test('lote permite corrigir a rua de um ponto sem replicar nos demais e dispensa geocodificação naquele ponto', async () => {
  let lookups = 0;
  const payloads = await treeBatchPayloads(plan, [{ latitude: -8.6, longitude: -38.5, street_id: 's1', bairro_id: 'b1' }, { latitude: -8.61, longitude: -38.51 }], 64, {
    streets: [{ id: 's1', city_id: 64, name: 'Rua das Flores' }], neighborhoods: [{ id: 'b1', city_id: 64, name: 'Centro' }],
    lookup: async () => { lookups++; return { address: 'Rua Nova', suburb: 'Centro' }; },
  });
  assert.equal(lookups, 1);
  assert.equal(payloads[0].street_id, 's1');
  assert.equal(payloads[0].bairro_id, 'b1');
  assert.equal(payloads[1].street_id, null);
  assert.equal(payloads[1].address, 'Rua Nova');
  assert.ok(payloads.every(row => row.planting_year === 2027 && row.status === 'planejada'));
});
