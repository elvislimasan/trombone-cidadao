import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PATROL_PICK_STEPS,
  buildPatrolPickStepPath,
  getPatrolPickStep,
  isPatrolPickStep,
  parsePatrolPickStep,
  patrolPickStepFromSearch,
  patrolPickStepIds,
  patrolPickStepSibling,
  resolvePatrolPickStep,
} from '../lib/patrolPickFlow.js';

test('a preparacao tem tres passos, nesta ordem', () => {
  assert.deepEqual(PATROL_PICK_STEPS.map((passo) => passo.id), ['foco', 'ritmo', 'pronto']);
});

test('so os tres passos conhecidos entram na trilha', () => {
  assert.equal(isPatrolPickStep('foco'), true);
  assert.equal(isPatrolPickStep('resumo'), false);
  assert.equal(parsePatrolPickStep(' RITMO '), 'ritmo');
  assert.equal(parsePatrolPickStep('<script>'), null);
  assert.equal(parsePatrolPickStep(null), null);
});

test('quem chega com o foco decidido nao ve o passo do foco', () => {
  assert.deepEqual(patrolPickStepIds(false), ['foco', 'ritmo', 'pronto']);
  assert.deepEqual(patrolPickStepIds(true), ['ritmo', 'pronto']);
});

test('o passo vem da URL para o voltar e a recarga cairem no mesmo ponto', () => {
  assert.equal(patrolPickStepFromSearch('?passo=pronto'), 'pronto');
  assert.equal(patrolPickStepFromSearch('?categoria=buracos&passo=ritmo'), 'ritmo');
  assert.equal(patrolPickStepFromSearch(''), null);
  assert.equal(patrolPickStepFromSearch('?passo=inventado'), null);
});

test('passo ausente ou fora da trilha cai no primeiro passo dela', () => {
  assert.equal(resolvePatrolPickStep('', ['foco', 'ritmo', 'pronto']), 'foco');
  assert.equal(resolvePatrolPickStep('?passo=inventado', ['foco', 'ritmo', 'pronto']), 'foco');
  // O passo do foco existe, mas nao nesta visita: nao trava, comeca no ritmo.
  assert.equal(resolvePatrolPickStep('?passo=foco', ['ritmo', 'pronto']), 'ritmo');
  assert.equal(resolvePatrolPickStep('?passo=pronto', ['ritmo', 'pronto']), 'pronto');
});

test('avancar e voltar respeitam a trilha, e a ponta nao tem vizinho', () => {
  const completa = ['foco', 'ritmo', 'pronto'];
  assert.equal(patrolPickStepSibling(completa, 'foco', 1), 'ritmo');
  assert.equal(patrolPickStepSibling(completa, 'pronto', -1), 'ritmo');
  assert.equal(patrolPickStepSibling(completa, 'pronto', 1), null);
  assert.equal(patrolPickStepSibling(completa, 'foco', -1), null);
  // Sem o passo do foco, voltar do ritmo sai da preparacao em vez de pular nele.
  assert.equal(patrolPickStepSibling(['ritmo', 'pronto'], 'ritmo', -1), null);
});

test('a URL do passo carrega foco, ritmo e posicao na trilha', () => {
  assert.equal(
    buildPatrolPickStepPath({ categoria: 'buracos', modo: 'walking', passo: 'pronto' }),
    '/patrulhar?categoria=buracos&modo=walking&passo=pronto'
  );
});

test('sem foco escolhido a URL nao inventa categoria, e modo invalido cai no padrao', () => {
  assert.equal(
    buildPatrolPickStepPath({ categoria: null, modo: 'bike', passo: 'foco' }),
    '/patrulhar?modo=driving&passo=foco'
  );
});

test('cada passo sabe o rotulo do proprio botao', () => {
  assert.equal(getPatrolPickStep('pronto').avancar, 'Iniciar');
  assert.equal(getPatrolPickStep('foco').avancar, 'Continuar');
  assert.equal(getPatrolPickStep('inexistente').id, 'foco');
});
