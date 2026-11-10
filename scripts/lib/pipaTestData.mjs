import { createHash } from 'node:crypto';
import { pipaDay, pipaMonth } from '../../src/lib/pipa.js';

export const PIPA_TEST_MARKER = 'Demonstração Operação-pipa.';
export const PIPA_LEGACY_TEST_MARKER = '[TESTE OPERAÇÃO-PIPA v1]';
export const PIPA_TEST_TABLES = ['pipa_tanks', 'pipa_drivers', 'pipa_quotas', 'pipa_requests', 'pipa_deliveries'];
export const pipaTestRowKey = (table, row) => table === 'pipa_quotas' ? `${row.driver_id}:${row.month}` : row.id;

function seedId(channel, table, key) {
  const hash = createHash('sha256').update(`pipa-test-v1:${channel}:${table}:${key}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function syntheticCpf(index) {
  let digits = String(900000000 + index * 12345);
  for (let length = 9; length <= 10; length++) {
    const sum = [...digits].reduce((total, digit, i) => total + Number(digit) * (length + 1 - i), 0);
    digits += String(((sum * 10) % 11) % 10);
  }
  return digits;
}

// Dados fictícios, com IDs estáveis por secretaria e datas relativas ao dia
// escolhido. Não inclui contas Auth, nem dispara convites ou notificações.
export function createPipaTestData({ channelId, actorId, asOf = new Date(), center = [-8.597031, -38.574217] }) {
  if (!channelId || !actorId || !Number.isFinite(asOf.getTime())) throw new Error('Secretaria, responsável pelo seed e data são obrigatórios.');
  const now = asOf.toISOString(), [year, month, today] = pipaDay(asOf).split('-').map(Number);
  const id = (table, key) => seedId(channelId, table, key);
  const ago = days => new Date(asOf.getTime() - days * 86400000).toISOString();
  const at = (offset, day, slot = 0) => new Date(Math.min(Date.UTC(year, month - 1 - offset, day, 12 + slot), asOf.getTime() - 60000)).toISOString();
  const locations = [
    ['Centro', 0.001, -0.002, 'prefeitura'],
    ['Bairro Vila Bela', -0.012, 0.016, 'prefeitura'],
    ['Sítio Serra Negra', 0.065, -0.075, 'exercito'],
    ['Comunidade Lagoa Comprida', -0.095, 0.105, 'prefeitura'],
    ['Sítio Riacho do Meio', 0.12, 0.085, 'exercito'],
    ['Comunidade Boa Vista', -0.14, -0.1, 'prefeitura'],
    ['Sítio Pedra Branca', 0.18, -0.14, 'exercito'],
    ['Comunidade São José', -0.18, 0.13, 'prefeitura'],
  ];
  const tanks = locations.map(([locality, lat, lng, provider], index) => ({
    id: id('tank', index + 1), channel_id: channelId,
    name: `Caixa ${String(index + 1).padStart(2, '0')} · ${locality}`,
    locality,
    address: `Referência fictícia ${index + 1}, ${locality}`,
    latitude: Number((center[0] + lat).toFixed(7)), longitude: Number((center[1] + lng).toFixed(7)),
    capacity_liters: [20000, 10000, 16000, 20000, 16000, 12000, 20000, 10000][index], provider,
    responsible_name: `Responsável fictício ${index + 1}`,
    responsible_document: syntheticCpf(index + 1), responsible_phone: `879000000${String(index + 1).padStart(2, '0')}`,
    responsible_address: `Endereço fictício ${index + 1}, ${locality}`,
    notes: `${PIPA_TEST_MARKER} Local e responsável fictícios para demonstração.`,
    active: index !== 7, created_by: actorId, created_at: ago(365), updated_at: now,
  }));
  const drivers = [
    ['Pipeiro municipal A', 'TST1A01', 10000, 'prefeitura', true],
    ['Pipeiro municipal B', 'TST1A02', 8000, 'prefeitura', true],
    ['Pipeiro Exército', 'TST1A03', 12000, 'exercito', true],
    ['Pipeiro desativado', 'TST1A04', 10000, 'prefeitura', false],
  ].map(([name, plate, capacity_liters, provider, active], index) => ({
    id: id('driver', index + 1), channel_id: channelId, user_id: null, name, plate,
    capacity_liters, provider, active, created_at: ago(365), updated_at: now,
  }));
  const quotas = [], deliveries = [];
  for (let offset = 0; offset < 12; offset++) {
    const quotaMonth = pipaMonth(new Date(Date.UTC(year, month - 1 - offset, 1, 12)));
    drivers.forEach((driver, index) => quotas.push({
      driver_id: driver.id, month: quotaMonth, loads: offset === 0 && index === 0 ? 2 : [24, 18, 16, 12][index],
      updated_by: actorId, updated_at: now,
    }));
    for (let index = 0; index < 6; index++) {
      const driver = drivers[[0, 1, 2, 0, 1, offset === 0 ? 2 : 3][index]];
      const tank = tanks[(offset * 2 + index) % 7], loads = index === 1 ? 2 : 1;
      const day = offset === 0 ? Math.max(1, Math.floor((index + 1) * today / 7)) : [3, 8, 12, 17, 22, 27][index];
      const delivered_at = at(offset, day, index % 3), gps = index % 2 === 0;
      deliveries.push({
        id: id('delivery', `${quotaMonth}:${index + 1}`), channel_id: channelId, tank_id: tank.id, driver_id: driver.id, request_id: null,
        delivered_at, loads, liters: loads * driver.capacity_liters, provider: driver.provider, source: gps ? 'gps' : 'manual',
        locality: tank.locality, destination_name: tank.name, driver_name: driver.name, plate: driver.plate, capacity_liters: driver.capacity_liters,
        latitude: gps ? tank.latitude : null, longitude: gps ? tank.longitude : null, accuracy_m: gps ? 12 : null,
        notes: `${PIPA_TEST_MARKER} Entrega fictícia inserida por script de demonstração.`, recorded_by: actorId, recorded_at: delivered_at,
      });
    }
  }
  const scenarios = [
    ['urgent', 'pending', 0, null, 'Caixa seca desde ontem.'],
    ['urgent', 'pending', 2, null, 'Caixa do Exército sem água; solicitação de apoio municipal.'],
    ['urgent', 'assigned', 1, 0, 'Urgência já direcionada ao pipeiro municipal.'],
    ['one_off', 'assigned', 4, 1, 'Apoio da prefeitura para caixa habitualmente atendida pelo Exército.'],
    ['one_off', 'pending', null, null, 'Pedido avulso em local sem caixa cadastrada.'],
    ['regular', 'in_transit', 3, 2, 'Deslocamento fictício em andamento.'],
    ['urgent', 'completed', 5, 0, 'Solicitação urgente já atendida.'],
    ['one_off', 'completed', null, 1, 'Carrada avulsa já entregue.'],
    ['regular', 'cancelled', 6, null, 'Solicitação fictícia cancelada pelo solicitante.'],
    ['regular', 'pending', 0, null, 'Abastecimento de rotina aguardando direcionamento.'],
  ];
  const requests = scenarios.map(([kind, status, tankIndex, driverIndex, notes], index) => {
    const tank = tankIndex == null ? null : tanks[tankIndex], driver = driverIndex == null ? null : drivers[driverIndex];
    const completed_at = status === 'completed' ? ago(index === 6 ? 2 : 1) : null;
    return {
      id: id('request', index + 1), channel_id: channelId, tank_id: tank?.id || null, driver_id: driver?.id || null,
      kind, status, requester_name: `Solicitante fictício ${index + 1}`, requester_phone: `879000001${String(index).padStart(2, '0')}`,
      locality: tank?.locality || 'Área urbana · entrega avulsa', address: tank?.address || 'Referência fictícia: rua de demonstração, casa 10',
      latitude: tank?.latitude ?? Number((center[0] + 0.014).toFixed(7)), longitude: tank?.longitude ?? Number((center[1] - 0.012).toFixed(7)),
      notes: `${PIPA_TEST_MARKER} ${notes}`, created_by: actorId, created_at: ago(index + 3),
      started_at: status === 'in_transit' ? new Date(asOf.getTime() - 1800000).toISOString() : completed_at ? new Date(new Date(completed_at).getTime() - 3600000).toISOString() : null,
      completed_at,
    };
  });
  for (const request of requests.filter(row => row.status === 'completed')) {
    const driver = drivers.find(row => row.id === request.driver_id), tank = tanks.find(row => row.id === request.tank_id);
    deliveries.push({
      id: id('delivery-request', request.id), channel_id: channelId, tank_id: request.tank_id, driver_id: driver.id, request_id: request.id,
      delivered_at: request.completed_at, loads: 1, liters: driver.capacity_liters, provider: driver.provider, source: 'manual',
      locality: request.locality, destination_name: tank?.name || 'Entrega avulsa · área urbana', driver_name: driver.name,
      plate: driver.plate, capacity_liters: driver.capacity_liters, latitude: null, longitude: null, accuracy_m: null,
      notes: `${PIPA_TEST_MARKER} Atendimento fictício lançado manualmente para demonstração.`, recorded_by: actorId, recorded_at: request.completed_at,
    });
  }
  return { pipa_tanks: tanks, pipa_drivers: drivers, pipa_quotas: quotas, pipa_requests: requests, pipa_deliveries: deliveries };
}
