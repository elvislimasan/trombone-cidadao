import { PONTOS, PONTOS_POR_ETAPA } from './patrolGame.js';
import { etapasConcluidas } from './missions.js';

// Pontos e nível.
//
// A conta vivia em SQL (`get_user_level`, migrações 169 e 174). Ela volta para
// cá porque as missões passaram a valer pontos, e as missões são um catálogo
// JavaScript: manter a conta no banco exigiria duplicar as escadas em SQL, e
// duas cópias de uma regra de pontuação divergem no primeiro ajuste.
//
// A função do banco continua existindo e devolvendo a base — o perfil ainda a
// usa. Os pesos aqui são os mesmos da 174, e o teste afirma isso; mudar um lado
// sem o outro faz o mesmo usuário ter dois totais.
//
// A ARMADILHA DA CIRCULARIDADE
//
// Missão dá ponto → ponto define nível → nível decide quais missões aparecem.
// Se o ponto de missão contasse só as desbloqueadas, o cálculo se morderia: o
// total dependeria do nível que depende do total.
//
// O nó se desfaz porque o nível só governa a EXIBIÇÃO. O progresso de uma
// missão bloqueada corre igual — ninguém deixa de investigar buracos porque a
// tela não mostrava o cartão. Então as etapas vencidas são contadas sem
// consultar nível nenhum, e a conta é uma linha reta.

// A constante mudou de casa (para patrolGame.js, ao lado de PONTOS) para que
// missions.js possa lê-la sem fechar um ciclo de imports. Continua exportada
// daqui porque é aqui que se procura por pontuação.
export { PONTOS_POR_ETAPA };

/** Faixas de nível. Iguais às da migração 169. */
export const FAIXAS = [
  { minimo: 300, nivel: 4, rotulo: 'Guardião da cidade' },
  { minimo: 100, nivel: 3, rotulo: 'Voz da comunidade' },
  { minimo: 20, nivel: 2, rotulo: 'Cidadão ativo' },
  { minimo: 0, nivel: 1, rotulo: 'Novo por aqui' },
];

/**
 * Pontos das ações em si. Espelha a escala da migração 174.
 *
 * `reports_count` conta só as broncas de origem própria: a que nasceu de sinal
 * pertence a quem a completou, e é paga como missão cumprida.
 */
export const pontosDeAcoes = (c = {}) =>
  (c?.reports_count || 0) * PONTOS.bronca +
  (c?.missions_count || 0) * PONTOS.missao +
  (c?.signals_count || 0) * PONTOS.sinal +
  (c?.empties_count || 0) * PONTOS.vistoria +
  (c?.updates_count || 0) * PONTOS.atualizacao +
  (c?.comments_count || 0) * PONTOS.comentario +
  (c?.upvotes_given || 0) * PONTOS.apoio;

/** Bônus pelas etapas de missão vencidas. Independe do nível — ver o topo. */
export const pontosDeMissoes = (c = {}) => etapasConcluidas(c) * PONTOS_POR_ETAPA;

/** Nível e rótulo para um total de pontos. */
export const nivelDe = (pontos) => {
  const total = Math.max(0, Number(pontos) || 0);
  const faixa = FAIXAS.find((f) => total >= f.minimo) || FAIXAS[FAIXAS.length - 1];
  return { points: total, level: faixa.nivel, label: faixa.rotulo };
};

/**
 * Quanto falta para a próxima faixa.
 * Devolve null no topo — não há barra a mostrar para quem chegou.
 */
export const proximaFaixa = (pontos) => {
  const total = Math.max(0, Number(pontos) || 0);
  const acima = [...FAIXAS]
    .sort((a, b) => a.minimo - b.minimo)
    .find((f) => f.minimo > total);
  if (!acima) return null;

  const atual = nivelDe(total);
  const piso = FAIXAS.find((f) => f.nivel === atual.level).minimo;
  return {
    ...acima,
    faltam: acima.minimo - total,
    fracao: Math.min(1, Math.max(0, (total - piso) / (acima.minimo - piso))),
  };
};

/**
 * O placar completo.
 *
 * Separa as duas parcelas de propósito: a tela mostra "180 pontos · 45 de
 * missões", e sem a separação o bônus seria invisível — quem não vê o prêmio
 * não persegue a etapa.
 */
export const placar = (contadores) => {
  const acoes = pontosDeAcoes(contadores);
  const missoes = pontosDeMissoes(contadores);
  const total = acoes + missoes;

  return {
    pontosAcoes: acoes,
    pontosMissoes: missoes,
    ...nivelDe(total),
    proxima: proximaFaixa(total),
  };
};
