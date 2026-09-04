// Import relativo, não pelo alias '@/': os testes rodam em `node --test`, que
// não conhece o alias do Vite.
import { bearing, haversine } from './navGeo.js';

// Para onde a patrulha aponta.
//
// O QUE ISTO RESOLVE
//
// Os sinais pendentes já apareciam como pinos no mapa, e o card de ação surgia
// a 15 m. Entre uma coisa e outra não havia nada: quem saía para patrulhar via
// pontos espalhados e escolhia no olho para qual ir — ou não escolhia, e passava
// a 30 m de um sem saber.
//
// Agora o app aponta sozinho para o mais próximo, e continua apontando enquanto
// a pessoa anda, sem pedir confirmação e sem interromper.
//
// POR QUE O ALVO NÃO PODE SER "SIMPLESMENTE O MAIS PRÓXIMO"
//
// Essa é a parte que parece trivial e não é. Com dois sinais quase à mesma
// distância, recalcular a cada leitura de GPS faz o alvo alternar entre os dois
// a cada segundo — a seta gira, a distância pula, e o painel fica inutilizável
// justamente quando há mais de uma coisa para fazer por perto.
//
// A regra é de INÉRCIA: o alvo atual só perde a vez para um candidato
// MUITO mais perto. Enquanto a diferença for pequena, quem está escolhido
// continua escolhido, mesmo que o outro passe a ser tecnicamente o mais próximo.
//
// O ruído do GPS urbano fica na casa de 10–20 m. A margem precisa ser maior que
// ele, senão a inércia não segura nada; e menor que o quarteirão, senão o app
// insiste num alvo que ficou para trás. 40 m fica entre os dois.

export const TROCA_MINIMA_M = 40;

/**
 * O sinal para onde apontar agora.
 *
 * @param {{lat:number,lng:number}|null} posicao
 * @param {Array<{id:*,lat:number,lng:number}>} missoes  sinais pendentes
 * @param {{id:*}|null} alvoAtual  para onde já se apontava; a inércia parte dele
 * @returns {object|null} a missão escolhida, com `distancia` em metros
 */
export const escolherAlvo = (posicao, missoes, alvoAtual = null) => {
  if (!posicao || !Number.isFinite(posicao.lat) || !Number.isFinite(posicao.lng)) return null;

  const candidatos = (Array.isArray(missoes) ? missoes : [])
    .filter((m) => m && Number.isFinite(m.lat) && Number.isFinite(m.lng))
    .map((m) => ({ ...m, distancia: haversine(posicao, m) }))
    .sort((a, b) => a.distancia - b.distancia);

  if (candidatos.length === 0) return null;

  const maisProximo = candidatos[0];
  // O alvo anterior tem de continuar EXISTINDO na lista. Ele sai dela quando
  // alguém registra, descarta, ou quando o corredor deixa de alcançá-lo — e nos
  // três casos apontar para ele seria apontar para nada.
  const anterior = alvoAtual
    ? candidatos.find((m) => String(m.id) === String(alvoAtual.id))
    : null;

  if (!anterior) return maisProximo;
  return maisProximo.distancia <= anterior.distancia - TROCA_MINIMA_M
    ? maisProximo
    : anterior;
};

/**
 * O rumo do alvo em relação a PARA ONDE A PESSOA ESTÁ INDO, em graus.
 *
 * Zero é em frente, positivo é à direita, negativo à esquerda — é o que uma
 * seta na tela precisa para significar alguma coisa em movimento. O rumo
 * absoluto (norte) só serviria com o aparelho na horizontal e a pessoa olhando
 * a bússola, que não é o caso de quem está dirigindo.
 *
 * Devolve `null` quando o GPS não sabe o rumo — parado, ele não sabe. Sem rumo
 * a seta não tem como estar certa, e uma seta apontando para o lugar errado é
 * pior que nenhuma: o painel mostra só a distância.
 */
export const rumoRelativo = (posicao, alvo) => {
  if (!posicao || !alvo) return null;
  if (!Number.isFinite(posicao.heading)) return null;
  if (!Number.isFinite(alvo.lat) || !Number.isFinite(alvo.lng)) return null;

  const absoluto = bearing(posicao, alvo);
  // Normaliza para -180..180: 190° à direita é a mesma coisa que 170° à
  // esquerda, e girar a seta pelo caminho longo faria ela dar a volta na tela.
  return ((absoluto - posicao.heading + 540) % 360) - 180;
};

/** Distância curta o bastante para caber no painel de quem está dirigindo. */
export const formatarDistancia = (metros) => {
  const valor = Number(metros);
  if (!Number.isFinite(valor) || valor < 0) return '';
  if (valor < 1000) return `${Math.round(valor)} m`;
  return `${(valor / 1000).toFixed(1).replace('.', ',')} km`;
};
