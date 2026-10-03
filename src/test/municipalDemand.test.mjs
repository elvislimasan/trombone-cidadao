import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDemandFields } from '../lib/municipalDemand.js';
import { canEditDemand, DEMAND_INITIAL_FORM, demandPayload, demandReportLocations, formFromReport, suggestDemandAssignment, validateDemand } from '../lib/municipalDemand.js';

const context = {
  isAdministrator: true, channels: [{ id: 'lighting' }, { id: 'roads' }],
  categoryChannels: [{ category_id: 'iluminacao', canal_id: 'lighting' }],
  members: [{ canal_id: 'lighting', user_id: 'technician', ativo: true, papel: 'operador' }], serviceRules: [],
};

test('localização da demanda conserva os endereços e pontos de todas as broncas vinculadas', () => {
  const reports = Array.from({ length: 4 }, (_, index) => ({ id: `r${index}`, title: `Bronca ${index}`, address: ` Rua ${index} `, neighborhood: ' Centro ', location: { coordinates: [-38.5 + index * 0.01, -8.6] } }));
  const locations = demandReportLocations(reports);
  assert.equal(locations.length, 4);
  assert.deepEqual(locations.map((location) => location.address), ['Rua 0', 'Rua 1', 'Rua 2', 'Rua 3']);
  assert.equal(locations[0].neighborhood, 'Centro');
  assert.deepEqual(locations[0].position, { lat: -8.6, lng: -38.5 });
  assert.equal(reports[0].address, ' Rua 0 ');
});

test('broncas sem endereço ou coordenadas permanecem na lista sem inventar pontos no mapa', () => {
  const locations = demandReportLocations([
    { id: 'missing' },
    { id: 'null', address: '   ', location: { coordinates: [null, null] } },
    { id: 'blank', location: { lat: '', lng: '' } },
    { id: 'partial', location: { coordinates: [-38.5] } },
    { id: 'invalid', location: { coordinates: [-181, -91] } },
    { id: 'text', location: { lat: 'unknown', lng: -38 } },
    { id: 'legacy', location: { lat: '-8.6', lng: '-38.5' } },
    { id: 'zero', location: { coordinates: [0, 0] } },
  ]);
  assert.equal(locations.length, 8);
  assert.ok(locations.slice(0, 6).every((location) => location.position === null));
  assert.equal(locations[1].address, '');
  assert.deepEqual(locations[6].position, { lat: -8.6, lng: -38.5 });
  assert.deepEqual(locations[7].position, { lat: 0, lng: 0 });
  assert.deepEqual(demandReportLocations(), []);
});
test('preenchimento copia dados de localização e só sugere atribuição inequívoca', () => {
  const form = formFromReport({ title: 'Poste sem luz', category_id: 'iluminacao', address: 'Rua A', neighborhood: 'Centro', location: { coordinates: [-38, -8] }, pole_id: 42 }, context);
  assert.equal(form.canal_id, 'lighting'); assert.equal(form.atribuido_a, 'technician');
  assert.equal(form.latitude, -8); assert.equal(form.longitude, -38); assert.equal(form.pole_id, 42);
  assert.equal(form.prazo_em, ''); assert.equal(form.primeira_resposta_prazo_em, '');
  const ambiguous = { ...context, members: [...context.members, { canal_id: 'lighting', user_id: 'second', ativo: true, papel: 'gestor' }] };
  assert.equal(suggestDemandAssignment(ambiguous, 'iluminacao').atribuido_a, '');
  assert.equal(suggestDemandAssignment(context, '').canal_id, '');
});
test('prazos e prioridade vêm da regra configurada, preservando o fuso local', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  const form = formFromReport({ category_id: 'iluminacao' }, { ...context, serviceRules: [{ category_id: 'iluminacao', atendimento_horas: 72, primeira_resposta_horas: 12, prioridade: 'alta' }] }, now);
  const payload = demandPayload(form);
  assert.equal(new Date(payload.prazo_em).getTime() - now.getTime(), 72 * 3600000);
  assert.equal(new Date(payload.primeira_resposta_prazo_em).getTime() - now.getTime(), 12 * 3600000);
  assert.equal(payload.prioridade, 'alta');
});
test('a permissão de uma secretaria não permite operar outra', () => {
  const operator = { ...context, isAdministrator: false, editableChannelIds: ['lighting'] };
  assert.equal(canEditDemand(operator, 'lighting'), true);
  assert.equal(canEditDemand(operator, 'roads'), false);
  assert.equal(canEditDemand(operator, null), false);
  assert.equal(canEditDemand(context, null), true);
});
test('ordem concluída aceita foto e observação opcionais e mantém a secretaria obrigatória', () => {
  const form = { ...DEMAND_INITIAL_FORM, titulo: 'Trocar luminária', status: 'concluida', canal_id: 'lighting', atribuido_a: '' };
  assert.equal(validateDemand(form), '');
  assert.equal(validateDemand({ ...form, resultado: 'Luminária substituída.' }), '');
  assert.match(validateDemand({ ...form, canal_id: '' }), /secretaria/);
  assert.match(validateDemand({ ...form, status: 'triagem' }, { previousStatus: 'concluida' }), /reabertura/);
});

test('eletricista informa serviço executado e pode deixar o resultado vazio ao concluir', () => {
  const form = { ...DEMAND_INITIAL_FORM, titulo: 'Trocar luminária', category_id: 'iluminacao', status: 'concluida', canal_id: 'lighting' };
  assert.deepEqual(Object.keys(validateDemandFields(form, { electricianMode: true })), ['service_type']);
  assert.deepEqual(validateDemandFields({ ...form, service_type: 'lamp_replacement' }, { electricianMode: true }), {});
  assert.deepEqual(validateDemandFields({ ...form, service_type: 'lamp_replacement', resultado: '   ' }, { electricianMode: true }), {});
  assert.deepEqual(Object.keys(validateDemandFields({ ...form, service_type: 'lamp_replacement', resultado: 'Curto' }, { electricianMode: true })), ['resultado']);
  assert.deepEqual(validateDemandFields({ ...form, service_type: 'lamp_replacement', resultado: 'Luminária substituída.' }, { electricianMode: true }), {});
  assert.deepEqual(validateDemandFields({ ...form, status: 'em_andamento' }, { electricianMode: true }), {});
  assert.deepEqual(validateDemandFields(form), {});
});

test('ordens podem ser criadas, programadas e iniciadas sem responsável cadastrado', () => {
  const form = { ...DEMAND_INITIAL_FORM, titulo: 'Manutenção pela equipe da secretaria', canal_id: 'lighting', atribuido_a: '' };
  assert.equal(validateDemand(form), '');
  assert.equal(demandPayload(form).atribuido_a, null);
  assert.equal(validateDemand({ ...form, status: 'programada', previsto_em: '2026-10-01T10:00' }), '');
  assert.equal(validateDemand({ ...form, status: 'em_andamento' }), '');
  assert.match(validateDemand({ ...form, canal_id: '', status: 'programada', previsto_em: '2026-10-01T10:00' }), /secretaria/);
});
test('validação associa cada erro ao campo e remove somente os erros corrigidos', () => {
  const form = { ...DEMAND_INITIAL_FORM, titulo: '', status: 'programada', canal_id: '' };
  const errors = validateDemandFields(form);
  assert.deepEqual(Object.keys(errors), ['titulo', 'canal_id', 'previsto_em']);
  const corrected = validateDemandFields({ ...form, titulo: 'Trocar luminária', previsto_em: '2026-10-01T10:00' });
  assert.deepEqual(Object.keys(corrected), ['canal_id']);
  assert.deepEqual(validateDemandFields({ ...form, status: 'triagem', titulo: 'Trocar luminária' }), {});
});

test('pendência separa motivo e data de revisão e aponta a coordenada inválida', () => {
  const form = { ...DEMAND_INITIAL_FORM, titulo: 'Atender solicitação', status: 'aguardando_recurso' };
  assert.deepEqual(Object.keys(validateDemandFields(form)), ['motivo_pendencia', 'proxima_acao_em']);
  assert.deepEqual(Object.keys(validateDemandFields({ ...form, motivo_pendencia: 'Material em falta' })), ['proxima_acao_em']);
  const located = { ...form, status: 'triagem', latitude: 91, longitude: -38 };
  assert.deepEqual(Object.keys(validateDemandFields(located)), ['latitude']);
  assert.deepEqual(Object.keys(validateDemandFields({ ...located, latitude: -8, longitude: '' })), ['longitude']);
});

test('programação e pendências exigem informações de acompanhamento', () => {
  const form = { ...DEMAND_INITIAL_FORM, titulo: 'Atender solicitação', canal_id: 'lighting', atribuido_a: 'technician' };
  assert.match(validateDemand({ ...form, status: 'programada' }), /previsão/);
  assert.match(validateDemand({ ...form, status: 'aguardando_recurso', motivo_pendencia: 'Material em falta' }), /revista/);
  assert.equal(validateDemand({ ...form, status: 'aguardando_recurso', motivo_pendencia: 'Material em falta', proxima_acao_em: '2026-10-01T10:00' }), '');
});
