// Os passos da preparação, antes de ligar o GPS.
//
// POR QUE PASSOS SEPARADOS, E NÃO UMA ROLAGEM
//
// A preparação empilhava duas decisões na mesma página: o ritmo num cartão
// grande em cima, a lista de focos embaixo. Quem chegava pelo atalho de uma
// missão — que já traz o foco decidido — rolava a lista inteira só para
// confirmar o que já estava escolhido, e quem chegava do zero via as duas
// perguntas ao mesmo tempo sem saber qual respondia primeiro.
//
// Em passos, cada tela faz UMA pergunta e o rodapé carrega UMA ação. E o passo
// do foco simplesmente não existe quando a missão já o trouxe: pular é mais
// honesto do que mostrar uma lista com uma opção já marcada.
//
// A ORDEM MUDOU: FOCO ANTES DO RITMO
//
// "O que vou procurar" é a decisão de verdade; "como vou me deslocar" é
// consequência dela — conferir postes se faz a pé, varrer buracos se faz de
// carro. Perguntar o ritmo primeiro obrigava a decidir o meio antes do fim.
//
// O PASSO VAI NA URL
//
// Assim o voltar do Android — e o do navegador — anda um passo para trás em vez
// de abandonar a preparação inteira. Recarregar no meio também cai no mesmo
// ponto, com as mesmas escolhas, porque elas viajam junto na mesma URL.

import {
  PATROL_TRAVEL_MODE_PARAM,
  normalizePatrolTravelMode,
} from './patrolTravelMode.js';

export const PATROL_PICK_STEP_PARAM = 'passo';
export const PATROL_PICK_CATEGORY_PARAM = 'categoria';

export const PATROL_PICK_STEPS = Object.freeze([
  Object.freeze({
    id: 'foco',
    label: 'Foco',
    titulo: 'O que vamos observar?',
    descricao: 'Escolha um foco para receber alertas mais relevantes.',
    avancar: 'Continuar',
  }),
  Object.freeze({
    id: 'ritmo',
    label: 'Ritmo',
    titulo: 'Escolha seu ritmo',
    descricao: 'Como você vai se deslocar muda o alcance dos alertas.',
    avancar: 'Continuar',
  }),
  Object.freeze({
    id: 'pronto',
    label: 'Pronto',
    titulo: 'Tudo pronto para sair',
    descricao: 'Confira as escolhas e comece quando quiser.',
    avancar: 'Iniciar',
  }),
]);

const IDS = PATROL_PICK_STEPS.map((passo) => passo.id);
const SEM_FOCO = IDS.filter((id) => id !== 'foco');

export const isPatrolPickStep = (value) => IDS.includes(value);

export const parsePatrolPickStep = (value) => {
  const normalizado = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return IDS.includes(normalizado) ? normalizado : null;
};

export const getPatrolPickStep = (id) =>
  PATROL_PICK_STEPS.find((passo) => passo.id === id) || PATROL_PICK_STEPS[0];

/**
 * A trilha de passos desta visita. Sem o foco quando ele já veio decidido —
 * é a única diferença entre os dois roteiros, e ela é estrutural: o passo não
 * fica desabilitado nem marcado como concluído, ele não existe.
 */
export const patrolPickStepIds = (pularFoco) => (pularFoco ? SEM_FOCO : IDS);

export const patrolPickStepFromSearch = (search = '') => {
  try {
    return parsePatrolPickStep(new URLSearchParams(search).get(PATROL_PICK_STEP_PARAM));
  } catch {
    return null;
  }
};

/**
 * Um passo adulterado na URL — ou o passo do foco numa visita que o pulou —
 * não trava a tela: cai no primeiro passo da trilha, que é sempre válido.
 */
export const resolvePatrolPickStep = (search = '', passos = IDS) => {
  const daUrl = patrolPickStepFromSearch(search);
  return daUrl && passos.includes(daUrl) ? daUrl : passos[0];
};

export const patrolPickStepSibling = (passos, atual, direcao) => {
  const indice = passos.indexOf(atual);
  if (indice < 0) return null;
  return passos[indice + direcao] ?? null;
};

/**
 * A URL completa da preparação: foco, ritmo e passo. Diferente de
 * `buildPatrolPickPath`, que é o atalho de entrada das missões e carrega só a
 * categoria, esta é a URL que a própria tela escreve ao avançar.
 */
export const buildPatrolPickStepPath = ({ categoria, modo, passo } = {}) => {
  const params = new URLSearchParams();
  if (categoria) params.set(PATROL_PICK_CATEGORY_PARAM, String(categoria));
  params.set(PATROL_TRAVEL_MODE_PARAM, normalizePatrolTravelMode(modo));
  params.set(PATROL_PICK_STEP_PARAM, parsePatrolPickStep(passo) || IDS[0]);
  return `/patrulhar?${params.toString()}`;
};
