import test from 'node:test';
import assert from 'node:assert/strict';
import { pipaStatistics, pipaPeriod, pipaCalendarMonth, pipaCoordinates, pipaFreshPosition, pipaMaskCpf, pipaPhoneDigits, pipaValidCpf, pipaValidPhone, pipaCapabilities, pipaTankCapacity, pipaTankRequester } from '../lib/pipa.js';
import { municipalHome, municipalRouteAllowed, municipalWorkspaceChannel } from '../lib/municipalAccess.js';
import { resolveLoginDestination } from '../lib/municipalityAccess.js';

const now = new Date('2026-11-10T14:00:00Z');
test('caixa sem capacidade ou responsável não inventa valores', () => {
  assert.equal(pipaTankCapacity(null), 'Não informada');
  assert.equal(pipaTankCapacity(16000), '16.000 L');
  assert.deepEqual(pipaTankRequester({ responsible_name: 'Não informado', responsible_phone: null }), { requester_name: '', requester_phone: '' });
});
test('períodos respeitam o calendário de Fortaleza nas viradas de mês e ano', () => {
  assert.deepEqual(pipaPeriod('previous', now), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(pipaPeriod('previous', new Date('2026-01-10T12:00:00Z')), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(pipaPeriod('month', new Date('2026-11-01T01:00:00Z')), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(pipaCalendarMonth('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
});
test('descarga usa GPS com no máximo cinco segundos e renova amostras antigas', async () => {
  let reads = 0;
  const geo = { getCurrentPosition(success, fail, options) { reads++; assert.equal(options.maximumAge, 0); success({ coords: { latitude: -8.7, longitude: -38.6, accuracy: 5 }, timestamp: 20000 }); } };
  const recent = await pipaFreshPosition({ lat: -8.6, lng: -38.5, accuracy: 12, timestamp: 17000 }, geo, 20000);
  assert.equal(recent.coords.latitude, -8.6); assert.equal(reads, 0);
  const fresh = await pipaFreshPosition({ lat: -8.6, lng: -38.5, accuracy: 12, timestamp: 10000 }, geo, 20000);
  assert.equal(fresh.coords.latitude, -8.7); assert.equal(reads, 1);
  await pipaFreshPosition({ lat: -8.6, lng: -38.5, timestamp: 21000 }, geo, 20000); assert.equal(reads, 2);
  await assert.rejects(() => pipaFreshPosition(null, null), /GPS indisponível/);
});
test('contagem distingue caixas únicas, carradas, avulsas e prestador efetivo', () => {
  const tanks = [{ id: 'army', provider: 'exercito', active: true }, { id: 'city', provider: 'prefeitura', active: true }, { id: 'old', provider: 'prefeitura', active: false }];
  const deliveries = [
    { driver_id: 'driver', tank_id: 'army', provider: 'prefeitura', delivered_at: '2026-10-05T12:00:00Z', loads: 2, liters: 20000, locality: 'Serra' },
    { driver_id: 'driver', tank_id: 'army', provider: 'prefeitura', delivered_at: '2026-10-20T12:00:00Z', loads: 1, liters: 10000, locality: 'Serra' },
    { driver_id: 'driver', tank_id: null, provider: 'prefeitura', delivered_at: '2026-10-20T12:00:00Z', loads: 1, liters: 5000, locality: 'Lagoa' },
    { driver_id: 'army-driver', tank_id: 'army', provider: 'exercito', delivered_at: '2026-10-22T12:00:00Z', loads: 1, liters: 12000, locality: 'Serra' },
    { driver_id: 'driver', tank_id: 'city', provider: 'prefeitura', delivered_at: '2026-11-01T02:00:00Z', loads: 1, liters: 10000, locality: 'Serra' },
    { driver_id: 'driver', tank_id: 'city', provider: 'prefeitura', delivered_at: '2025-01-01T12:00:00Z', loads: 90, liters: 900000, locality: 'Serra' },
  ];
  const data = { tanks, deliveries, drivers: [{ id: 'driver', name: 'José', plate: 'ABC1D23' }, { id: 'army-driver', name: 'Militar' }], quotas: [{ driver_id: 'driver', month: '2026-10-01', loads: 3 }] };
  const stats = pipaStatistics(data, { ...pipaPeriod('previous', now), provider: 'prefeitura' }, now);
  assert.equal(stats.prefeituraTanks, 1); assert.equal(stats.exercitoTanks, 1);
  assert.equal(stats.deliveredLastMonth, 2, 'uma caixa abastecida várias vezes conta uma única vez');
  assert.equal(stats.loads, 5); assert.equal(stats.liters, 45000); assert.equal(stats.tanksServed, 2);
  assert.equal(stats.annualLoads, 6, 'anual inclui os dois prestadores e ignora entregas antigas');
  assert.deepEqual(stats.byDriver[0].localities, ['Lagoa', 'Serra']);
  assert.equal(stats.byDriver[0].quota, 3); assert.equal(stats.byDriver[0].monthLoads, 5);
  assert.equal(pipaStatistics(data, { from: '2026-10-01', to: '2026-10-31', locality: 'Lagoa' }, now).tanksServed, 0, 'avulsa sem caixa não cria caixa fictícia');
});
test('CPF e coordenadas rejeitam valores vazios ou inválidos', () => {
  assert.equal(pipaValidCpf('529.982.247-25'), true);
  for (const cpf of ['', '11111111111', '52998224720']) assert.equal(pipaValidCpf(cpf), false);
  assert.equal(pipaCoordinates('', ''), false); assert.equal(pipaCoordinates(91, 0), false);
  assert.equal(pipaCoordinates(0, 0), true); assert.equal(pipaCoordinates(-8.6, -38.5), true);
});
test('máscara de CPF aceita digitação parcial, colagem e limita a onze dígitos', () => {
  for (const [input, expected] of [['', ''], ['123', '123'], ['1234', '123.4'], ['1234567', '123.456.7'], ['52998224725', '529.982.247-25'], ['529.982.247-25', '529.982.247-25'], ['52998224725123abc', '529.982.247-25']]) {
    assert.equal(pipaMaskCpf(input), expected);
  }
});
test('telefone valida DDD e comprimento, aceitando fixo, celular e prefixo brasileiro', () => {
  for (const phone of ['8738511234', '(87) 3851-1234', '87999990003', '(87) 99999-0003', '+55 (87) 99999-0003']) assert.equal(pipaValidPhone(phone), true, phone);
  for (const phone of ['', '12345', '00999990003', '00000000000', '11111111111', '879999900031']) assert.equal(pipaValidPhone(phone), false, phone);
  assert.equal(pipaPhoneDigits('+55 (87) 99999-0003'), '87999990003');
  assert.equal(pipaPhoneDigits('(55) 99999-0003'), '55999990003', 'DDD 55 não é confundido com o prefixo do país');
});
test('acesso e entrada preservam a secretaria e o perfil do pipeiro', () => {
  const channels = [{ id: 'a', manage: true, request: true }, { id: 'b', manage: false, request: true }];
  const staff = { waterChannels: channels, activeChannelId: 'b' };
  assert.equal(pipaCapabilities(staff).canManage, false); assert.equal(pipaCapabilities(staff).canRequest, true);
  assert.equal(municipalRouteAllowed('/prefeitura/operacao-pipa/solicitacoes', staff), true);
  assert.equal(municipalRouteAllowed('/prefeitura/operacao-pipa', {}), false);
  assert.equal(municipalHome({ waterChannels: channels }), '/prefeitura/operacao-pipa/mapa');
  assert.equal(municipalWorkspaceChannel('/prefeitura/operacao-pipa/mapa', true, 'a'), 'a');
  assert.equal(resolveLoginDestination({ app_metadata: { pipa_driver: true } }, '/feed'), '/operacao-pipa/pipeiro');
});
