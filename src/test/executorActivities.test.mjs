import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { departmentExecutionScope, executionActivity, eligibleExecutors, validateExecutorResult } from '../lib/executorActivities.js';
import { municipalCapabilities, municipalHome, municipalRouteAllowed } from '../lib/municipalAccess.js';
import { loadExecutorDraft, saveExecutorDraft, clearExecutorDraft } from '../lib/executorDraft.js';

test('todas as categorias têm execução; o mapa adapta Poda e Buracos sem inferir nomes', () => {
  assert.deepEqual(departmentExecutionScope(['poda', 'iluminacao', 'limpeza', 'buracos', 'esgoto'], ['arborization', 'urban_planning']), { arborizacao: ['poda'], eletricista: ['iluminacao'], servicos_gerais: ['limpeza', 'esgoto'], ruas: ['buracos'] });
  assert.deepEqual(departmentExecutionScope(['poda'], []), { servicos_gerais: ['poda'] });
  assert.deepEqual(departmentExecutionScope([], ['arborization']), {});
});

test('execução aceita resultado, nota e anexos vazios, mantendo a atividade e os limites de texto', () => {
  const activity = executionActivity('arborizacao');
  assert.equal(validateExecutorResult(activity, { services: ['poda'] }), '');
  assert.equal(validateExecutorResult(activity, { services: ['poda'], result: 'OK', note: 'Feito', files: [] }), '');
  assert.match(validateExecutorResult(activity, { services: [] }), /Selecione os serviços/);
  assert.match(validateExecutorResult(activity, { services: ['lamp_replacement'] }), /Selecione os serviços/);
  assert.match(validateExecutorResult(activity, { services: ['poda'], result: 'x'.repeat(4001) }), /4000/);
});
test('executor exclusivo tem destino próprio e mantém especialidades separadas por secretaria', () => {
  const rows = [{ canal_id: 'agri', atendimento: 'nenhum', especialidades_execucao: ['arborizacao'] }, { canal_id: 'roads', atendimento: 'nenhum', especialidades_execucao: ['ruas'] }];
  const agri = municipalCapabilities(rows, false, 'agri');
  assert.equal(agri.canReadAttendance, false);
  assert.equal(agri.canExecuteLighting, false);
  assert.equal(municipalHome(agri), executionActivity('arborizacao').path);
  assert.equal(municipalRouteAllowed('/prefeitura/executor/arborizacao/ordem/a', agri), true);
  assert.equal(municipalRouteAllowed('/prefeitura/executor/ruas', agri), false);
  assert.equal(municipalRouteAllowed('/prefeitura/eletricista', agri), false);
});
test('atribuição de Poda exige executor da mesma secretaria, mesmo com funções acumuladas', () => {
  const context = { channels: [{ id: 'agri', execution_specialties: ['arborizacao'], execution_categories: { arborizacao: ['poda'] } }], members: [
    { user_id: 'manager', canal_id: 'agri', ativo: true, especialidades_execucao: [] },
    { user_id: 'worker', canal_id: 'agri', ativo: true, especialidades_execucao: ['arborizacao'] },
    { user_id: 'other', canal_id: 'other', ativo: true, especialidades_execucao: ['arborizacao'] },
    { user_id: 'suspended', canal_id: 'agri', ativo: false, especialidades_execucao: ['arborizacao'] },
  ] };
  assert.deepEqual(eligibleExecutors(context, 'agri', 'poda').map(row => row.user_id), ['worker']);
});
test('rascunho com foto pertence à conta, município, atividade e ordem; limpeza vence gravação pendente', async () => {
  const scope = { userId: 'worker', municipalityId: 'pref', activity: 'arborizacao', orderId: 'tree-order' };
  const form = { result: 'Poda executada', note: 'Registro técnico', services: ['poda'], files: [{ id: 'photo', file: new File(['photo bytes'], 'arvore.jpg', { type: 'image/jpeg' }) }], operationId: 'operation', version: 3 };
  await saveExecutorDraft(scope, form);
  const restored = await loadExecutorDraft(scope);
  assert.equal(restored.result, form.result);
  assert.equal(await restored.files[0].file.text(), 'photo bytes');
  for (const field of Object.keys(scope)) assert.equal(await loadExecutorDraft({ ...scope, [field]: 'another' }), null);
  const pending = saveExecutorDraft(scope, form);
  await clearExecutorDraft(scope); await pending;
  assert.equal(await loadExecutorDraft(scope), null);
});
