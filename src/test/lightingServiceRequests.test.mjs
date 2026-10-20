import test from 'node:test';
import assert from 'node:assert/strict';
import { poleCode, parseLightingRows, matchLightingRows, prepareLightingRequests, lightingServiceDescription } from '../../scripts/lib/lightingServiceRequests.mjs';

const pole = (id, lng = -38.57, overrides = {}) => ({ id, city_id: 64, identifier: `${id} - X123`, plate: null, latitude: -8.59, longitude: lng, validation_status: 'approved', lighting_status: 'aceso', ...overrides });
const row = (id = 1, code = 'S/N', longitude = -38.57) => ({ page: 1, cells: [String(id), 'Centro', 'Rua A', 'Via Local', 'C5', 'P5', code, '-8.59', String(longitude), 'Vapor de sódio', '70', 'Concreto', 'Braço antigo', 'LED', '100', 'Braço novo', 'Relé', '8', '5 graus', 'Cabos'] });
const match = (rows, poles) => matchLightingRows(parseLightingRows(rows), poles, { cityId: 64 });
const prepare = (matches) => prepareLightingRequests(matches, { cityId: 64, municipalityId: 'prefeitura', sourceId: 'pdf' });

test('barramento ignora prefixo sequencial, caixa e marcações sem número', () => {
  assert.equal(poleCode(' 12 — x123 '), 'X123');
  assert.equal(poleCode('S/N'), null);
  assert.equal(poleCode('sem identificação'), null);
});
test('prioriza código e registra divergência das coordenadas para vistoria', () => {
  const [m] = match([row(1, 'x123')], [pole(1, -38.58), pole(2, -38.57, { identifier: 'Y456' })]);
  assert.equal(m.pole.id, 1);
  assert.equal(m.method, 'code');
  assert.equal(m.warning, 'code_coordinate_conflict');
});
test('usa coordenadas sem barramento e limita cidade, aprovação e distância', () => {
  const [m] = match([row()], [pole(1, -38.57, { city_id: 65 }), pole(2, -38.57, { validation_status: 'rejected' }), pole(3, -38.57001)]);
  assert.equal(m.pole.id, 3);
  assert.equal(m.reason, null);
  assert.equal(match([row()], [pole(1, -38.58)])[0].reason, 'outside_radius');
});
test('não escolhe arbitrariamente entre postes quase equidistantes ou códigos repetidos', () => {
  const [m] = match([row()], [pole(1, -38.57001), pole(2, -38.56999)]);
  assert.equal(m.reason, 'ambiguous');
  assert.equal(match([row(1, 'X123')], [pole(1), pole(2)])[0].reason, 'ambiguous');
  assert.equal(match([row(1, 'X123')], [pole(1), pole(2, -38.58)])[0].pole.id, 1);
});
test('consolida linhas do mesmo poste preservando os itens e cria IDs estáveis', () => {
  const matches = match([row(), row(2, 'X123')], [pole(1)]);
  const first = prepare(matches);
  assert.equal(first.requests.length, 1);
  assert.deepEqual(first.requests[0].sourceRows, [1, 2]);
  const p = first.requests[0].payload;
  assert.equal(p.issue_type, 'other');
  assert.equal(p.is_public, false);
  assert.match(p.description, /itens 1, 2 da planilha/);
  assert.match(p.description, /Troca de lâmpada de vapor de sódio de 70 W por luminária LED de 100 W/);
  assert.equal(prepare(matches).requests[0].payload.id, p.id);
});
test('pontos distintos não são fundidos silenciosamente no mesmo poste', () => {
  const result = prepare(match([row(1, 'X123'), row(2, 'S/N', -38.57015)], [pole(1)]));
  assert.equal(result.requests.length, 1);
  assert.deepEqual(result.requests[0].sourceRows, [1]);
  assert.equal(result.pending[0].reason, 'different_source_points_same_pole');
});

test('colisão mantém apenas o ponto sem código claramente mais próximo, sem criar poste', () => {
  const result = prepare(match([row(1, 'S/N', -38.57001), row(2, 'S/N', -38.57015)], [pole(1)]));
  assert.equal(result.requests.length, 1);
  assert.deepEqual(result.requests[0].sourceRows, [1]);
  assert.equal(result.requests[0].payload.pole_id, 1);
  assert.deepEqual(result.pending.map((m) => m.source.row), [2]);
});

test('colisão não decide automaticamente quando o ponto mais próximo tem barramento divergente', () => {
  const result = prepare(match([row(1, 'Y456', -38.57001), row(2, 'S/N', -38.57015)], [pole(1)]));
  assert.equal(result.requests.length, 0);
  assert.equal(result.pending.length, 2);
});
test('rejeita números repetidos, coordenadas ausentes e valores inválidos', () => {
  assert.throws(() => parseLightingRows([row(), row()]), /inválidos/);
  const missing = row(); missing.cells[7] = '';
  assert.throws(() => parseLightingRows([missing]), /inválidos/);
});

test('descrição respeita quantidades e potências múltiplas do PDF', () => {
  const multiple = row();
  multiple.cells[9] = '4xLâmpada Vapor de Sodio';
  multiple.cells[10] = '4x70';
  multiple.cells[14] = '4x(150)';
  assert.match(lightingServiceDescription(parseLightingRows([multiple])), /4 lâmpadas de vapor de sódio de 70 W cada por 4 luminárias LED de 150 W cada/);
});

test('descrição mantém a potência ambígua sem presumir valor por unidade', () => {
  const multiple = row();
  multiple.cells[9] = '2xLâmpada Vapor de Sodio';
  multiple.cells[14] = '2x(150)';
  assert.match(lightingServiceDescription(parseLightingRows([multiple])), /2 lâmpadas de vapor de sódio \(potência indicada na planilha: 70 W\) por 2 luminárias LED de 150 W cada/);
});
