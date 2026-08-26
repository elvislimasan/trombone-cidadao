import { PONTOS, PONTOS_POR_ETAPA } from './patrolGame.js';
import { etapasConcluidas } from './missions.js';
import { PONTOS_DIARIA, PONTOS_DIA_PERFEITO } from './dailies.js';

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

/**
 * Faixas de nível NOMEADAS, do topo para a base.
 *
 * As quatro primeiras são as da migração 169 e não podem mudar: o
 * `get_user_level` ainda as devolve, e um usuário com dois níveis diferentes
 * conforme a tela é pior do que um teto baixo. As de cima são novas e só
 * existem aqui — o banco nunca precisou delas porque quem exibe nível é o app.
 */
export const FAIXAS = [
  { minimo: 5200, nivel: 8, rotulo: 'Lenda da cidade' },
  { minimo: 3000, nivel: 7, rotulo: 'Patrono do bairro' },
  { minimo: 1600, nivel: 6, rotulo: 'Referência da cidade' },
  { minimo: 800, nivel: 5, rotulo: 'Sentinela do bairro' },
  { minimo: 300, nivel: 4, rotulo: 'Guardião da cidade' },
  { minimo: 100, nivel: 3, rotulo: 'Voz da comunidade' },
  { minimo: 20, nivel: 2, rotulo: 'Cidadão ativo' },
  { minimo: 0, nivel: 1, rotulo: 'Novo por aqui' },
];

// NÃO EXISTE NÍVEL MÁXIMO, E ESSA É A DECISÃO
//
// Uma tabela fixa só empurra o problema: quem chegasse ao último nome veria
// "nível máximo alcançado" e perderia a única medida de progresso que a
// central oferece — logo a pessoa que mais usou o app. Acima do último nome os
// níveis continuam por fórmula, e a barra nunca fica sem próximo alvo.
//
// O CRESCIMENTO É GEOMÉTRICO, E ARREDONDADO NA CENTENA
//
// Cada degrau custa 75% a mais que o anterior. Linear faria os níveis altos
// caírem em sequência num fim de semana; exponencial forte tornaria o seguinte
// inalcançável. E o arredondamento existe porque "9.100 XP" é um alvo e
// "9.087 XP" é um número de máquina.
const CRESCIMENTO = 1.75;

/** A faixa nomeada mais alta. Daí para cima, quem manda é a fórmula. */
const TOPO = FAIXAS[0];

const degrauAcimaDe = (minimo) => Math.round((minimo * CRESCIMENTO) / 100) * 100;

const ORDINAIS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Quantos pontos um nível exige — inclusive além dos nomeados. */
export const minimoDoNivel = (nivel) => {
  const alvo = Math.max(1, Math.floor(Number(nivel) || 1));
  const nomeada = FAIXAS.find((f) => f.nivel === alvo);
  if (nomeada) return nomeada.minimo;

  let minimo = TOPO.minimo;
  for (let n = TOPO.nivel; n < alvo; n += 1) minimo = degrauAcimaDe(minimo);
  return minimo;
};

/**
 * O rótulo de um nível. Passado o último nome, o título do topo ganha numeral:
 * "Lenda da cidade II". Inventar nomes indefinidamente daria títulos cada vez
 * mais vazios; o numeral diz "você passou do fim da escada" sem fingir que há
 * uma patente nova a cada degrau.
 */
export const rotuloDoNivel = (nivel) => {
  const alvo = Math.max(1, Math.floor(Number(nivel) || 1));
  const nomeada = FAIXAS.find((f) => f.nivel === alvo);
  if (nomeada) return nomeada.rotulo;

  const grau = alvo - TOPO.nivel + 1;
  return `${TOPO.rotulo} ${ORDINAIS[grau - 1] || grau}`;
};

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
  (c?.upvotes_given || 0) * PONTOS.apoio +
  // Bônus das diárias (200). São BÔNUS, não substituição: quem fechou "apoie 5
  // broncas" recebe os 5 dos apoios MAIS os 10 da diária. O dia perfeito soma
  // por cima dos três.
  //
  // Diferente das etapas de missão, estes saem de um fato gravado
  // (`daily_completions`) em vez de serem recalculados — sem isso, saber quantas
  // diárias fecharam no passado exigiria os contadores diários de todo o
  // histórico, por uma resposta que não muda.
  (c?.dailies_completed || 0) * PONTOS_DIARIA +
  (c?.perfect_days || 0) * PONTOS_DIA_PERFEITO;

/** Bônus pelas etapas de missão vencidas. Independe do nível — ver o topo. */
export const pontosDeMissoes = (c = {}) => etapasConcluidas(c) * PONTOS_POR_ETAPA;

/** Nível e rótulo para um total de pontos. */
export const nivelDe = (pontos) => {
  const total = Math.max(0, Number(pontos) || 0);
  const faixa = FAIXAS.find((f) => total >= f.minimo) || FAIXAS[FAIXAS.length - 1];

  // Abaixo do topo nomeado a tabela responde sozinha. No topo, continua-se
  // subindo degrau a degrau enquanto os pontos alcançarem o próximo.
  if (faixa.nivel < TOPO.nivel) {
    return { points: total, level: faixa.nivel, label: faixa.rotulo };
  }

  let nivel = TOPO.nivel;
  let proximo = degrauAcimaDe(TOPO.minimo);
  while (total >= proximo) {
    nivel += 1;
    proximo = degrauAcimaDe(proximo);
  }

  return { points: total, level: nivel, label: rotuloDoNivel(nivel) };
};

/**
 * Quanto falta para o próximo nível.
 *
 * NUNCA DEVOLVE `null`
 *
 * Devolvia, quando o nível 4 era o fim: quem chegasse lá via "nível máximo
 * alcançado" e uma barra sem função. Como a escada não acaba mais, sempre há um
 * próximo alvo — e quem usa isto pode contar com um objeto.
 */
export const proximaFaixa = (pontos) => {
  const total = Math.max(0, Number(pontos) || 0);
  const atual = nivelDe(total);
  const piso = minimoDoNivel(atual.level);
  const minimo = minimoDoNivel(atual.level + 1);

  return {
    nivel: atual.level + 1,
    rotulo: rotuloDoNivel(atual.level + 1),
    minimo,
    faltam: minimo - total,
    fracao: Math.min(1, Math.max(0, (total - piso) / (minimo - piso))),
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
