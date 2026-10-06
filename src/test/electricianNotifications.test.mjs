import assert from 'node:assert/strict';
import test from 'node:test';
import { isElectricianServiceNotification } from '../lib/electricianNotifications.js';

test('sino do eletricista aceita novas solicitações e ordens disponíveis', () => {
  for (const tipo of ['solicitacao', 'ordem']) {
    assert.equal(isElectricianServiceNotification({
      type: 'agency_case', link: `/prefeitura/eletricista?oferta=${tipo}:nova`,
    }), true);
  }
});

test('novas ordens atribuídas pela gestão entram no sino', () => {
  for (const title of ['Atendimento atribuído a você', 'Ordem urgente atribuída', 'Ordem prioritária atribuída']) {
    assert.equal(isElectricianServiceNotification({
      type: 'agency_case', title, link: '/prefeitura/eletricista/ordem/nova',
    }), true);
  }
});

test('avisos antigos dos próprios atendimentos e avisos gerais não entram no sino', () => {
  for (const notification of [
    { type: 'agency_case', title: 'Atendimento atribuído a você', link: '/prefeitura/demandas/visita' },
    { type: 'agency_case', title: 'Resultado do atendimento precisa de revisão', link: '/prefeitura/eletricista/ordem/antiga' },
    { type: 'agency_case', title: 'Prazo vencido', link: '/prefeitura/eletricista/ordem/antiga' },
    { type: 'agency_case', link: '/prefeitura/broncas' },
    { type: 'agency_response', link: '/bronca/resolvida' },
    { type: 'status_update', link: '/bronca/resolvida' },
    { type: 'system', link: '/prefeitura/eletricista?oferta=ordem:nova' },
    { type: 'agency_case', link: '/prefeitura/eletricista?oferta=visita:propria' },
    { type: 'agency_case', link: '/prefeitura/eletricista?oferta=ordem:' },
    null,
  ]) assert.equal(isElectricianServiceNotification(notification), false);
});
