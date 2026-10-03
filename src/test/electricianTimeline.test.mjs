import assert from 'node:assert/strict';
import test from 'node:test';
import { electricianTimeline } from '../lib/electricianTimeline.js';

const at = '2026-10-03T21:57:06Z';
const event = (id, tipo, detalhes = {}, created_at = at) => ({ id, tipo, detalhes, created_at });

test('resume a conclusão em um marco e ignora auditorias automáticas', () => {
  const events = [
    event('poste', 'atualizada', { mensagem: 'Poste atualizado e atendimento resolvido pelo eletricista.', alteracoes: { poste: { antes: {}, depois: {} } } }),
    event('verificada', 'resolucao_confirmada', { mensagem: 'Todas as broncas vinculadas tiveram a resolução verificada.' }),
    event('revisao-1', 'atualizada', { sistema: true, alteracoes: { revisao_pendente: { antes: true, depois: false } } }),
    event('revisao-2', 'atualizada', { sistema: true, alteracoes: { revisao_pendente: { antes: false, depois: true } } }),
    event('concluida', 'atualizada', { alteracoes: { status: { antes: 'em_andamento', depois: 'concluida' }, executada_em: { antes: null, depois: at } } }),
    event('iniciada', 'atualizada', { alteracoes: { status: { antes: 'aberta', depois: 'em_andamento' } } }, '2026-10-03T20:00:00Z'),
    event('atribuida', 'atribuida', {}, '2026-10-03T19:00:00Z'),
    event('criada', 'criada', {}, '2026-10-02T18:00:00Z'),
  ];
  assert.deepEqual(electricianTimeline(events).map(({ title }) => title), [
    'Poste consertado', 'Serviço iniciado', 'Ordem atribuída', 'Ordem criada',
  ]);
});

test('mostra verificação feita depois como etapa independente', () => {
  const events = [
    event('verificada', 'resolucao_confirmada', {}, '2026-10-05T21:57:06Z'),
    event('concluida', 'atualizada', { alteracoes: { status: { antes: 'em_andamento', depois: 'concluida' } } }),
  ];
  assert.deepEqual(electricianTimeline(events).map(({ title }) => title), ['Resolução verificada', 'Poste consertado']);
});

test('mantém conclusões de ciclos diferentes após reabertura', () => {
  const events = [
    event('nova-conclusao', 'atualizada', { alteracoes: { status: { antes: 'em_andamento', depois: 'concluida' } } }),
    event('reaberta', 'atualizada', { alteracoes: { status: { antes: 'concluida', depois: 'aberta' } } }, '2026-10-03T19:00:00Z'),
    event('conclusao-anterior', 'atualizada', { alteracoes: { status: { antes: 'em_andamento', depois: 'concluida' } } }, '2026-10-01T19:00:00Z'),
  ];
  assert.deepEqual(electricianTimeline(events).map(({ title }) => title), [
    'Poste consertado', 'Atendimento reaberto', 'Poste consertado',
  ]);
});
