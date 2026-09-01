// A coleção da cidade e os checkpoints culturais.
//
// SÃO A MESMA MECÂNICA, E JUNTÁ-LAS É A DECISÃO
//
// A §36.14 lista "coleção da cidade" e "checkpoints culturais" como duas
// entregas. Construídas separadas seriam duas listas de lugares, duas telas de
// progresso e duas formas de descobrir a mesma praça. O que muda entre elas é o
// TIPO do ponto, não o que a pessoa faz — então há um catálogo, com tipos.
//
// POR QUE ISTO NÃO É TERRITÓRIO COM OUTRO NOME
//
// É a linha mais fina desta fase. "Território individual" está fora do roadmap
// (§36.14) e o princípio 6 diz que ninguém é dono de rua, bairro ou prioridade
// pública. Uma coleção mal desenhada vira exatamente isso: quem chegou primeiro
// fica com o ponto, e os outros olham.
//
// Três regras impedem:
//
//   • descobrir NÃO é exclusivo — dez pessoas descobrem a mesma praça, e a
//     descoberta de uma não tira nada da outra;
//   • não existe "primeiro a descobrir" em lugar nenhum da interface;
//   • a coleção não dá vantagem, ponto (mesma regra dos cosméticos da fase 4).
//
// O QUE JÁ EXISTE NO REPOSITÓRIO, E POR QUE ISSO IMPORTA
//
// `pavement_streets` guarda `honoree_name`, `biography`, `curiosities` e
// `historical_photos` desde a 197: a rua que homenageia alguém JÁ É um
// checkpoint cultural com conteúdo escrito. `tourist_spots` também existe.
//
// Inventar um catálogo novo do zero significaria pedir a alguém que
// recadastrasse tudo — e a coleção nasceria vazia, que é como uma coleção morre.
//
// A SEGURANÇA VEM ANTES DA COLEÇÃO
//
// Um jogo que dá pontos por ir a lugares cria motivo para ir a lugares. O
// princípio 8 e a §36.6 já limitam a rota a horário diurno; aqui vale o mesmo, e
// por um motivo mais forte: a rota manda a pessoa a problemas do bairro dela, e
// uma coleção pode mandá-la a qualquer canto da cidade.

import { haversine } from './navGeo.js';

/**
 * Até onde vale como "estive lá".
 *
 * 80 m. Mais largo que os 60 m da sugestão de pavimento porque um ponto de
 * coleção é um lugar, não uma linha: a praça inteira conta, e exigir precisão de
 * calçada faria a descoberta falhar por GPS urbano ruim — que é ruído, não
 * fraude.
 *
 * Mais estreito que os 100 m da regra de presença da patrulha porque aqui não há
 * nada para validar depois: a descoberta não passa por moderação, então o raio é
 * a única barreira.
 */
export const RAIO_DE_DESCOBERTA_M = 80;

/** Só de dia, pelo mesmo motivo da Rota do Dia. */
export const HORA_INICIO = 6;
export const HORA_FIM = 18;

/**
 * Os tipos de ponto.
 *
 * `fonte` diz de onde o ponto vem. Nenhum deles é cadastrado só para a coleção:
 * todos existem porque a cidade precisa deles por outro motivo, e a coleção os
 * reaproveita. É o que impede o catálogo de virar trabalho de cadastro para
 * alimentar um jogo.
 */
export const TIPOS_DE_PONTO = [
  {
    id: 'rua_historica',
    rotulo: 'Rua com história',
    descricao: 'Uma rua cujo nome homenageia alguém, com a história registrada.',
    fonte: 'pavement_streets',
    emoji: '📖',
  },
  {
    id: 'ponto_turistico',
    rotulo: 'Ponto de interesse',
    descricao: 'Um lugar que a cidade indica a quem chega.',
    fonte: 'tourist_spots',
    emoji: '🏛️',
  },
  {
    id: 'marco_cultural',
    rotulo: 'Marco cultural',
    descricao: 'Cadastrado pela moderação da cidade.',
    fonte: 'city_collectibles',
    emoji: '🎭',
  },
];

export const tipoDePonto = (id) => TIPOS_DE_PONTO.find((t) => t.id === id) || null;

const lista = (v) => (Array.isArray(v) ? v : []);

/**
 * Dá para descobrir agora?
 *
 * Devolve motivo em vez de só `false` — mesma razão da Rota do Dia: um botão que
 * some sem explicação ensina que o app é instável.
 */
export const podeDescobrir = ({ ponto, posicao, agora = new Date() } = {}) => {
  if (!ponto) return { ok: false, motivo: 'sem_ponto', texto: 'Ponto não encontrado.' };

  const hora = agora.getHours();
  if (hora < HORA_INICIO || hora >= HORA_FIM) {
    return {
      ok: false,
      motivo: 'noite',
      texto:
        'Pontos da coleção só são registrados durante o dia. O app não cria motivo para você ir a um lugar desconhecido no escuro.',
    };
  }

  if (!posicao || !Number.isFinite(posicao.lat) || !Number.isFinite(posicao.lng)) {
    return {
      ok: false,
      motivo: 'sem_posicao',
      texto: 'Precisamos da sua localização para confirmar que você está no lugar.',
    };
  }

  const distancia = haversine(posicao, ponto);
  if (distancia > RAIO_DE_DESCOBERTA_M) {
    return {
      ok: false,
      motivo: 'longe',
      distancia,
      texto: `Você está a ${Math.round(distancia)} m daqui. Chegue mais perto para registrar a visita.`,
    };
  }

  return { ok: true, motivo: null, distancia, texto: null };
};

/**
 * A coleção de uma pessoa, pronta para a tela.
 *
 * `descobertoPor` NÃO é devolvido, e a ausência é o desenho. A pergunta "quem
 * descobriu primeiro" não tem resposta nesta interface — porque a resposta viraria
 * um placar de quem tem mais tempo livre, e a partir daí o ponto pertence a
 * alguém.
 *
 * @param {Array} pontos      catálogo
 * @param {Array} descobertas linhas do próprio usuário
 */
export const colecaoDe = (pontos = [], descobertas = []) => {
  const meus = new Set(lista(descobertas).map((d) => String(d.ponto_id)));

  const itens = lista(pontos).map((p) => ({
    ...p,
    tipo: tipoDePonto(p.tipo) || tipoDePonto('marco_cultural'),
    descoberto: meus.has(String(p.id)),
  }));

  const porTipo = TIPOS_DE_PONTO.map((t) => {
    const doTipo = itens.filter((i) => i.tipo?.id === t.id);
    return {
      ...t,
      total: doTipo.length,
      descobertos: doTipo.filter((i) => i.descoberto).length,
    };
  }).filter((t) => t.total > 0);

  const descobertos = itens.filter((i) => i.descoberto).length;

  return {
    itens,
    total: itens.length,
    descobertos,
    porTipo,
    // Fração para a barra. O denominador é o catálogo da cidade, que não muda
    // por ação de terceiro — é uma das poucas barras honestas deste produto,
    // pelo mesmo critério da meta comunitária.
    fracao: itens.length > 0 ? descobertos / itens.length : 0,
    rotulo: `${descobertos} de ${itens.length}`,
  };
};

/**
 * O que dizer quando alguém registra uma visita.
 *
 * Sem "conquistou", "dominou" ou "é seu". O verbo é `conheceu` — porque foi isso
 * que aconteceu, e porque o vocabulário é onde a coleção escorrega para
 * território sem ninguém decidir que escorregaria (§36.16).
 */
export const fraseDaDescoberta = (ponto) => {
  const nome = ponto?.nome || 'Este lugar';
  return {
    titulo: `Você conheceu ${nome}`,
    corpo:
      'Fica registrado na sua coleção. Outras pessoas podem conhecer o mesmo lugar — descobrir não tira de ninguém.',
  };
};

/**
 * Os pontos mais próximos que ainda faltam.
 *
 * Ordena por distância, e só isso: aqui não há "valor do dado" como na Rota do
 * Dia, porque um ponto de coleção não produz informação para a cidade. Ele é
 * passeio — e passeio se ordena por perto.
 */
export const proximosDaColecao = (colecao, posicao, quantidade = 5) => {
  if (!posicao || !Number.isFinite(posicao.lat)) return [];

  return lista(colecao?.itens)
    .filter((i) => !i.descoberto && Number.isFinite(i.lat) && Number.isFinite(i.lng))
    .map((i) => ({ ...i, distancia: haversine(posicao, i) }))
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, quantidade);
};
