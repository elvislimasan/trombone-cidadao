import test from 'node:test';
import assert from 'node:assert/strict';
import { brokenPole, closestPatrolPole, nextPatrolPole, DEFAULT_PATROL_FILTERS, filterPatrolPoles, patrolFiltersFromSearch, patrolSearch, patrolPoleBounds, patrolPositionIsPrecise } from '@/lib/electricianPatrol';

const position = { lat: -8.6, lng: -38.57, accuracy: 5 };
const pole = (id, meters, changes = {}) => ({ id, latitude: position.lat + meters / 111195,
  longitude: position.lng, lighting_status: 'apagado', ...changes });

test('alerta o poste quebrado mais próximo dentro dos mesmos 15 metros do cidadão', () => {
  assert.equal(closestPatrolPole(position, [pole(1, 20), pole(2, 14), pole(3, 6)]).pole.id, 3);
  assert.equal(closestPatrolPole(position, [pole(1, 16)]), null);
  assert.equal(closestPatrolPole(position, [pole(1, 0)]).distance, 0);
});
test('GPS impreciso, ausente e coordenadas inválidas não pedem atualização', () => {
  for (const current of [null, { ...position, accuracy: 30 }, { ...position, accuracy: undefined },
    { ...position, lat: 91 }, { ...position, lng: NaN }]) {
    assert.equal(patrolPositionIsPrecise(current), false);
    assert.equal(closestPatrolPole(current, [pole(1, 0)]), null);
  }
});
test('postergação não repete o mesmo poste e postes resolvidos ou removidos ficam fora', () => {
  const poles = [pole(1, 0), pole(2, 3, { lighting_status: 'aceso' }),
    pole(3, 5, { lighting_status: 'removido', is_broken: true }), pole(4, 8, { latitude: null })];
  assert.equal(closestPatrolPole(position, poles, new Set(['1'])), null);
  assert.equal(brokenPole(pole(5, 4, { lighting_status: 'manutencao' })), true);
  assert.equal(closestPatrolPole(position, [pole(6, 7, { lighting_status: 'aceso', is_broken: true })]).pole.id, 6);
});
test('a consulta local cobre o raio de alerta sem depender dos filtros do mapa', () => {
  const bounds = patrolPoleBounds(position);
  assert.ok(bounds.south < position.lat && bounds.north > pole(1, 100).latitude);
  assert.ok(bounds.west < position.lng && bounds.east > position.lng);
});

test('iniciar e reabrir patrulha preserva filtros, modo e contexto municipal', () => {
  const filters = { neighborhood: 'São José', serviceType: 'no_lighting', order: 'oldest' };
  const search = patrolSearch('?cidade=64&secretaria=iluminacao', 'walking', filters);
  assert.deepEqual(patrolFiltersFromSearch(search), filters);
  assert.equal(new URLSearchParams(search).get('modo'), 'walking');
  assert.equal(new URLSearchParams(search).get('cidade'), '64');
  assert.equal(new URLSearchParams(search).get('secretaria'), 'iluminacao');
  assert.deepEqual(patrolFiltersFromSearch('?servico=invalido&ordem=invalida'), DEFAULT_PATROL_FILTERS);
  const clean = new URLSearchParams(patrolSearch(search, 'driving', DEFAULT_PATROL_FILTERS));
  assert.equal(clean.has('bairro'), false); assert.equal(clean.has('servico'), false); assert.equal(clean.has('ordem'), false);
});

test('bairro e tipo devem coincidir na mesma solicitação e os alertas seguem a seleção', () => {
  const poles = [pole(1, 4), pole(2, 8, { lighting_status: 'aceso' }), pole(3, 6)];
  const services = [
    { pole_id: 1, issue_type: 'lamp_off', neighborhood: 'São José' },
    { pole_id: 1, issue_type: 'no_lighting', neighborhood: 'Centro' },
    { pole_id: 2, issue_type: 'no_lighting', neighborhood: 'São José' },
  ];
  const filtered = filterPatrolPoles(poles, services, { neighborhood: 'sao jose', serviceType: 'no_lighting', order: 'nearest' });
  assert.deepEqual(filtered.map(p => p.id), [2]);
  assert.equal(closestPatrolPole(position, filtered).pole.id, 2);
  assert.equal(closestPatrolPole(position, filtered, new Set(['2'])), null);
});

test('postes sem solicitação usam o estado e o bairro cadastrado ou o endereço', () => {
  const poles = [pole(1, 3, { raw_properties: { municipal: { bairro: 'Centro' } } }),
    pole(2, 5, { address: 'Rua A, bairro Centro', lighting_status: 'manutencao' }),
    pole(3, 6, { lighting_status: 'aceso' }), pole(4, 7, { lighting_status: 'removido', is_broken: true })];
  const filters = { ...DEFAULT_PATROL_FILTERS, neighborhood: 'Centro', serviceType: 'lamp_off' };
  assert.deepEqual(filterPatrolPoles(poles, [], filters).map(p => p.id), [1]);
  assert.deepEqual(filterPatrolPoles(poles, [], { ...filters, serviceType: 'other' }).map(p => p.id), [2]);
  assert.equal(filterPatrolPoles(poles, [], { ...filters, serviceType: 'no_lighting' }).length, 0);
});

test('outros abrange os demais subtipos, inclusive ordens internas', () => {
  const poles = [pole(1, 3), pole(2, 4), pole(3, 5), pole(4, 6, { lighting_status: 'removido' })];
  const services = [{ pole_id: 1, issue_type: 'lamp_on_daytime', bairro: 'Centro' },
    { pole_id: 2, issue_type: 'exposed_wiring', neighborhood: 'Centro' },
    { pole_id: 3, issue_type: 'no_lighting', neighborhood: 'Centro' },
    { pole_id: 4, issue_type: 'other', neighborhood: 'Centro' }];
  assert.deepEqual(filterPatrolPoles(poles, services, { ...DEFAULT_PATROL_FILTERS, serviceType: 'other', neighborhood: 'Centro' }).map(p => p.id), [1, 2]);
});

test('mais antigos usa a data da solicitação filtrada e mantém o raio seguro do alerta', () => {
  const poles = [pole(1, 3), pole(2, 12), pole(3, 16), pole(4, 4)];
  const services = [{ pole_id: 1, issue_type: 'lamp_off', created_at: '2026-10-30' },
    { pole_id: 1, issue_type: 'no_lighting', created_at: '2020-01-01' },
    { pole_id: 2, issue_type: 'lamp_off', created_at: '2026-09-01' },
    { pole_id: 3, issue_type: 'lamp_off', created_at: '2020-01-01' },
    { pole_id: 4, issue_type: 'lamp_off', created_at: 'inválido' }];
  const filtered = filterPatrolPoles(poles, services, { ...DEFAULT_PATROL_FILTERS, serviceType: 'lamp_off' });
  assert.equal(closestPatrolPole(position, filtered).pole.id, 1);
  assert.equal(closestPatrolPole(position, filtered, new Set(), 'oldest').pole.id, 2);
  assert.equal(closestPatrolPole(position, filtered, new Set(['2']), 'oldest').pole.id, 1);
});

test('destino considera todo o bairro e prioriza a solicitação mais antiga além do raio de alerta', () => {
  const poles = [pole(1, 5), pole(2, 850), pole(3, 2000)];
  const services = [
    { pole_id: 1, issue_type: 'lamp_off', neighborhood: 'Centro', created_at: '2026-10-30' },
    { pole_id: 2, issue_type: 'lamp_off', neighborhood: 'Centro', created_at: '2026-01-01' },
    { pole_id: 3, issue_type: 'lamp_off', neighborhood: 'Outro', created_at: '2020-01-01' },
  ];
  const filtered = filterPatrolPoles(poles, services, { ...DEFAULT_PATROL_FILTERS, neighborhood: 'Centro' });
  assert.equal(nextPatrolPole(position, filtered, new Set(), 'oldest').pole.id, 2);
  assert.equal(nextPatrolPole(position, filtered).pole.id, 1);
  assert.equal(closestPatrolPole(position, [filtered[1]]), null);
});

test('mantém um destino por vez mesmo quando outro fica mais próximo e avança ao pular', () => {
  const poles = [pole(1, 200), pole(2, 500)];
  const first = nextPatrolPole(position, poles);
  const moved = { ...position, lat: poles[1].latitude };
  assert.equal(nextPatrolPole(moved, poles, new Set(), 'nearest', first.pole).pole.id, 1);
  assert.equal(nextPatrolPole(moved, poles, new Set(['1']), 'nearest', first.pole).pole.id, 2);
  assert.equal(nextPatrolPole(position, [], new Set(), 'nearest', first.pole), null);
  assert.equal(nextPatrolPole({ ...position, accuracy: 40 }, poles), null);
  assert.equal(nextPatrolPole(position, [pole(3, 0, { latitude: 91 })]), null);
});
