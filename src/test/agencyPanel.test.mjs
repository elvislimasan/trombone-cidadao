import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agencyCaseCounts,
  agencyCaseStatus,
  agencyStatus,
  agencyReportImages,
  canManageAgencyTeam,
  canOperateAgency,
} from '../lib/agencyPanel.js';

test('capa municipal usa fotos anexadas, ignora vídeos e evita URLs repetidas', () => {
  assert.deepEqual(agencyReportImages(null), []);
  const report = { featured_image_url: ' capa.jpg ', report_media: [
    { type: 'video', url: 'video.mp4' },
    { type: 'photo', url: 'segunda.jpg', created_at: '2026-09-02' },
    { type: 'photo', url: 'primeira.jpg', created_at: '2026-09-01' },
    { type: 'photo', url: 'capa.jpg', created_at: '2026-09-03' },
    { type: 'photo', url: '   ' },
  ] };
  assert.deepEqual(agencyReportImages(report), ['capa.jpg', 'primeira.jpg', 'segunda.jpg']);
  assert.deepEqual(agencyReportImages({ ...report, featured_image_url: null }), ['primeira.jpg', 'segunda.jpg', 'capa.jpg']);
});

test('selo Nova usa os últimos sete dias da bronca original', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  const item = (created_at, status = 'nova') => ({ status, created_at: new Date(now).toISOString(), report: { created_at } });
  assert.equal(agencyCaseStatus(item('2026-09-24T12:00:00Z'), now).label, 'Nova');
  assert.equal(agencyCaseStatus(item('2026-09-17T12:00:00Z'), now).label, 'Nova');
  for (const date of ['2026-09-17T11:59:59Z', '2026-01-01', null, 'inválida', '2026-09-25']) {
    assert.equal(agencyCaseStatus(item(date), now).label, 'Aguardando recebimento');
  }
  assert.equal(agencyCaseStatus(item('2026-09-24T12:00:00Z', 'em_execucao'), now).label, 'Em execução');
});

test('resume a fila sem contar encerradas como abertas', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  const counts = agencyCaseCounts([
    { status: 'nova', prazo_em: past },
    { status: 'aguardando_confirmacao', prazo_em: future },
    { status: 'encerrada', prazo_em: past },
  ]);
  assert.deepEqual(counts, {
    total: 3,
    novas: 1,
    abertas: 2,
    atrasadas: 1,
    aguardandoConfirmacao: 1,
  });
});

test('papel de leitura nao opera nem administra equipe', () => {
  assert.equal(canOperateAgency('leitura'), false);
  assert.equal(canManageAgencyTeam('leitura'), false);
  assert.equal(canOperateAgency('operador'), true);
  assert.equal(canManageAgencyTeam('operador'), false);
  assert.equal(canManageAgencyTeam('gestor'), false);
  assert.equal(canManageAgencyTeam(null, true), true);
});

test('status desconhecido tem rotulo seguro', () => {
  assert.equal(agencyStatus('inventado').label, 'Situação desconhecida');
});
