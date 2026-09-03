// A Rota do Dia — piloto a pé.
//
// O QUE ELA RESPONDE
//
// "O que eu faço agora?" é a pergunta que o app não respondia. As missões
// permanentes são de longo prazo, as diárias dizem QUANTO mas não ONDE, e sair
// em patrulha exige decidir sozinho o trajeto. A rota transforma "sair sem
// rumo" num percurso com começo e fim.
//
// POR QUE SÓ A PÉ, E POR QUE ISSO NÃO É UMA LIMITAÇÃO TEMPORÁRIA
//
// O produto usa carro como modo PADRÃO (`DEFAULT_PATROL_TRAVEL_MODE`), e o
// plano é explícito (§36.6, Aposta 3): a versão a pé precisa ser uma rota
// separada e explícita, e o modo carro não pode herdar por acidente missões,
// bônus ou interações desenhadas para pedestres.
//
// Não é purismo. Uma rota de 5 paradas desenhada para quem caminha, executada
// por quem dirige, vira uma sequência de pedidos para olhar a tela em
// movimento — que é exatamente o que as diretrizes de segurança viária citadas
// no plano (§36.17) proíbem, e o que o princípio 8 do produto proíbe.
//
// POR QUE NÃO É "O ALVO MAIS PRÓXIMO"
//
// O ponto mais perto costuma ser o que já foi conferido — porque está perto de
// todo mundo, inclusive de quem passou antes. Uma rota que só encurta o
// caminho produz o dado mais fácil, não o mais necessário.
//
// A escolha combina necessidade (`valorDaVisita`, em recencia.js) com custo de
// chegar, e a ordem sai da própria escolha: a cada passo, o melhor ponto A
// PARTIR DE ONDE SE ESTÁ. Isso dá um caminho razoável sem serviço de roteamento
// e sem resolver caixeiro-viajante para cinco pontos.
//
// CONCLUSÃO POR CONTRIBUIÇÃO, NUNCA POR PASSAGEM
//
// Uma parada só fecha quando houve ação — confirmar, registrar, completar. Se
// passar perto contasse, bastaria caminhar pela avenida com o app aberto para
// fechar a rota, e ela deixaria de produzir qualquer coisa.
//
// É daí que vem a necessidade do pulo, e o limite de dois: sem pulo, um portão
// fechado trava a rota para sempre — e uma rota que não fecha só precisa
// acontecer uma vez para a pessoa não gerar a segunda.

import { haversine } from './navGeo.js';
import { estadoDeRecencia, valorDaVisita } from './recencia.js';

/**
 * Os limites do piloto. Todos vêm da §36.6 (Aposta 3), e nenhum é arbitrário.
 *
 * `PARADAS_MAX` de 5 e `METROS_MAX` de 1500 são a mesma restrição vista de dois
 * ângulos: 15 a 30 minutos de caminhada. O que estourar primeiro fecha a rota.
 *
 * `PULOS_MAX` de 2 é o que impede a rota de travar sem virar um botão de
 * "concluir sem fazer nada": com 5 paradas, dois pulos ainda exigem três
 * contribuições reais.
 */
export const PILOTO = Object.freeze({
  MODO: 'walking',
  RAIO_M: 800,
  PARADAS_MIN: 3,
  PARADAS_MAX: 5,
  METROS_MAX: 1500,
  PULOS_MAX: 2,
  // Perto o bastante para observar o ponto sem exigir a precisão impossível
  // de encostar no pino. O formulário fica fechado fora deste raio.
  RAIO_RESPOSTA_M: 30,
  /** Só de dia. A rota manda alguém a pé a pontos escolhidos por algoritmo. */
  HORA_INICIO: 6,
  /**
   * A última hora em que ainda dá para COMEÇAR — não a hora em que a rota
   * acaba. Uma rota de 30 minutos iniciada às 17h50 termina no escuro, e o
   * limite existe para a caminhada, não para o relógio.
   */
  HORA_LIMITE_INICIO: 17,
  /** Acima disto a pessoa não está parada, e o app não pede interação. */
  VELOCIDADE_PARADO_MS: 1.5,
});

/** A pergunta só existe quando a pessoa está fisicamente junto da parada. */
export const estaPertoDaParada = (posicao, parada, raioM = PILOTO.RAIO_RESPOSTA_M) => {
  if (!posicao || !parada) return false;
  if (![posicao.lat, posicao.lng, parada.lat, parada.lng].every(Number.isFinite)) return false;
  return haversine(posicao, parada) <= raioM;
};

/**
 * Dá para sair agora?
 *
 * Devolve motivo em vez de só `false` porque a tela precisa dizer por que o
 * botão não está lá. Um botão que some sem explicação ensina que o app é
 * instável; um aviso "volte amanhã de manhã" ensina como ele funciona.
 */
export const podeIniciarRota = ({ agora = new Date(), posicao } = {}) => {
  const hora = agora.getHours();

  if (hora < PILOTO.HORA_INICIO || hora > PILOTO.HORA_LIMITE_INICIO) {
    return {
      ok: false,
      motivo: 'noite',
      texto:
        'A Rota do Dia é um piloto a pé e só abre entre 6h e 18h. Sair a pé no escuro para um ponto escolhido por algoritmo não é uma boa ideia.',
    };
  }

  if (!posicao || !Number.isFinite(posicao.lat) || !Number.isFinite(posicao.lng)) {
    return {
      ok: false,
      motivo: 'sem_posicao',
      texto: 'Precisamos da sua localização para montar um percurso a pé.',
    };
  }

  return { ok: true, motivo: null, texto: null };
};

/**
 * A pessoa está parada o bastante para interagir?
 *
 * Princípio 8: o sistema nunca exige interação em movimento. `speed` vem do GPS
 * em m/s e é `null` em muitos aparelhos parados — ausência de leitura NÃO é
 * movimento, e tratá-la como tal bloquearia a ação justamente de quem parou.
 */
export const estaParado = (posicao) => {
  const v = posicao?.speed;
  if (!Number.isFinite(v)) return true;
  return v <= PILOTO.VELOCIDADE_PARADO_MS;
};

const lista = (v) => (Array.isArray(v) ? v : []);

/**
 * Monta o percurso.
 *
 * @param {object} args
 * @param {{lat:number,lng:number}} args.posicao
 * @param {Array} args.candidatos  pontos com {id, tipo, lat, lng, report, atualizacoes}
 * @param {Date}  [args.agora]
 * @returns {{paradas:Array, metros:number, suficiente:boolean}}
 */
export const montarRota = ({ posicao, candidatos = [], agora = new Date() } = {}) => {
  if (!posicao || !Number.isFinite(posicao.lat) || !Number.isFinite(posicao.lng)) {
    return { paradas: [], metros: 0, suficiente: false };
  }

  const restantes = lista(candidatos)
    .filter((c) => c && Number.isFinite(c.lat) && Number.isFinite(c.lng))
    .map((c) => ({
      ...c,
      estado: estadoDeRecencia({
        report: c.report ?? c,
        atualizacoes: c.atualizacoes ?? [],
        agora,
      }),
    }))
    // Valor zero sai antes de qualquer conta: um ponto que duas pessoas
    // independentes confirmaram este mês não vira parada nem se estiver na
    // esquina. A rota não existe para encher de tarefa.
    .filter((c) => c.estado.valor > 0 && haversine(posicao, c) <= PILOTO.RAIO_M);

  const paradas = [];
  let de = posicao;
  let metros = 0;

  while (restantes.length > 0 && paradas.length < PILOTO.PARADAS_MAX) {
    let melhor = null;
    let melhorIndice = -1;

    // `for` e não `forEach`: o callback capturaria `de`, que muda a cada volta,
    // e o eslint acusa com razão — é o tipo de closure que passa a ler o valor
    // errado na primeira vez que alguém tornar a iteração assíncrona.
    for (let i = 0; i < restantes.length; i += 1) {
      const c = restantes[i];
      const distancia = haversine(de, c);
      const valor = valorDaVisita(c.estado, distancia);
      if (!melhor || valor > melhor.valor) {
        melhor = { ...c, distancia, valor };
        melhorIndice = i;
      }
    }

    if (!melhor) break;
    // O orçamento é do percurso inteiro, não de cada perna: parar de somar
    // quando o próximo passo estoura é o que mantém a promessa de 30 minutos.
    if (metros + melhor.distancia > PILOTO.METROS_MAX) break;

    metros += melhor.distancia;
    paradas.push({ ...melhor, ordem: paradas.length + 1 });
    de = melhor;
    restantes.splice(melhorIndice, 1);
  }

  return {
    paradas,
    metros: Math.round(metros),
    // Menos de 3 paradas não é uma rota curta: é uma rota que não existe. Melhor
    // dizer "hoje não há o que percorrer por aqui" do que entregar um percurso
    // de uma parada e chamar de missão.
    suficiente: paradas.length >= PILOTO.PARADAS_MIN,
  };
};

/**
 * Quanto tempo a rota deve levar.
 *
 * 5 km/h de caminhada mais 3 minutos por parada — o tempo de olhar, decidir e
 * responder. Sem a segunda parcela a estimativa fica sempre otimista, e uma
 * estimativa otimista repetida é a forma mais rápida de a pessoa parar de
 * acreditar em qualquer número da tela.
 */
export const minutosEstimados = ({ metros = 0, paradas = 0 } = {}) =>
  Math.round((Number(metros) || 0) / 83) + 3 * (Number(paradas) || 0);

/**
 * O estado da rota em andamento.
 *
 * @param {Array} paradas
 * @param {object} progresso  { concluidas:Set|Array, puladas:Set|Array }
 */
export const estadoDaRota = (paradas = [], progresso = {}) => {
  const comoSet = (v) => (v instanceof Set ? v : new Set(lista(v)));
  const concluidas = comoSet(progresso.concluidas);
  const puladas = comoSet(progresso.puladas);

  const total = lista(paradas).length;
  const feitas = lista(paradas).filter((p) => concluidas.has(String(p.id))).length;
  const pulos = lista(paradas).filter((p) => puladas.has(String(p.id))).length;

  const proxima =
    lista(paradas).find(
      (p) => !concluidas.has(String(p.id)) && !puladas.has(String(p.id))
    ) || null;

  return {
    total,
    feitas,
    pulos,
    pulosRestantes: Math.max(0, PILOTO.PULOS_MAX - pulos),
    // Pular é um direito limitado, não uma saída livre: esgotados os dois, a
    // parada seguinte só sai do caminho com contribuição.
    podePular: pulos < PILOTO.PULOS_MAX,
    proxima,
    // A rota fecha quando não sobrou parada pendente E houve contribuição real.
    // `feitas > 0` é a guarda contra a rota "concluída" só de pulos — que seria
    // conclusão por passagem com outro nome.
    concluida: total > 0 && feitas + pulos >= total && feitas > 0,
    rotulo: `${feitas} de ${total}`,
  };
};

/**
 * A recompensa não é reduzida por pulo.
 *
 * O plano diz "até dois pulos, sem perda de recompensa" (§36.6). Descontar o
 * pulo criaria o incentivo exato que a rota não pode ter: inventar uma
 * observação em vez de admitir que não deu para verificar. Resposta honesta
 * nunca vale zero (princípio 10).
 */
export const recompensaDaRota = (estado) =>
  estado?.concluida ? { xp: 20, motivo: 'Rota do Dia concluída' } : null;
