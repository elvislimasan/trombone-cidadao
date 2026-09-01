// Cobertura por trecho de rua.
//
// O QUE ISTO SUBSTITUI, E POR QUE A GRADE ERA PIOR
//
// O plano original media território por hexágonos. A §36.6 (Aposta 4) pede
// trechos reais de rua sempre que possível — e neste projeto eles existem:
// `pavement_streets.path` guarda o traçado em MULTILINESTRING desde a 203.
//
// A diferença não é estética. Um hexágono não corresponde a nada que alguém
// possa ir conferir: metade dele é quintal, um terço é uma avenida que pertence
// a outro bairro, e "62% do hexágono coberto" é uma frase sem referente no
// mundo. "18 de 25 ruas verificadas" é uma frase que qualquer morador confere
// andando.
//
// É TAMBÉM O QUE TORNA A BARRA DE PROGRESSO LEGÍTIMA
//
// A §36.6 proíbe barra cujo denominador não esteja sob controle dos
// participantes. "Quantas ruas desta área têm notícia recente" é exatamente
// isso: o denominador é a lista de ruas, que não muda; o numerador sobe só com
// trabalho de quem participa; e nenhum terceiro precisa fazer nada para a barra
// andar. É a única barra que este produto pode desenhar honestamente.
//
// A JANELA AQUI É OUTRA — E NÃO É DESCUIDO
//
// `recencia.js` usa 28 dias porque fala de BRONCA: um buraco muda de estado em
// semanas. Pavimento muda em anos. Marcar como "vencida" uma classificação de
// dois meses encheria a cidade de tarefa inventada — e tarefa inventada é a
// forma mais rápida de gastar voluntário.
//
// EQUIDADE NÃO É RELATÓRIO, É GUARDA
//
// A §36.15 condiciona o avanço de fase a "a cobertura de áreas subamostradas
// não piorar". Por isso `coberturaDaArea` devolve o recorte por bairro junto do
// total: uma meta que sobe de 40% para 80% concentrando tudo no centro é uma
// meta que FALHOU, e um número único esconderia isso.
//
// E o que ele devolve NÃO É para tela pública. Ver `rotuloPublico`.

/**
 * Quanto tempo a classificação de uma rua continua valendo.
 *
 * Seis meses. Uma rua é asfaltada, esburacada ou recapeada em escala de meses,
 * não de semanas — e o custo de errar é assimétrico: janela curta demais produz
 * tarefa que não muda nada; janela longa demais produz um mapa desatualizado
 * que ninguém sabe que está desatualizado.
 */
export const JANELA_COBERTURA_DIAS = 180;

export const SEM_DADO = 'sem_dado';
export const VENCIDO = 'vencido';
export const UMA_OBSERVACAO = 'uma_observacao';
export const CONFIRMADO = 'confirmado';
export const CONFLITO = 'conflito';

/**
 * A camada de necessidade, na ordem em que ela é lida.
 *
 * `contaComoCoberto` é a coluna que define o numerador da meta — e é a decisão
 * mais consequente do arquivo. Uma observação isolada NÃO conta: se contasse,
 * uma pessoa sozinha fecharia a meta de um bairro inteiro num sábado, e a
 * "cobertura" mediria a persistência dela, não o que a cidade sabe.
 *
 * Conflito também não conta. Duas respostas opostas sobre a mesma rua são menos
 * informação que uma só — e chamá-las de cobertura seria contar a confusão como
 * conhecimento.
 */
export const ESTADOS_DE_COBERTURA = {
  [SEM_DADO]: {
    id: SEM_DADO,
    rotulo: 'Ninguém verificou',
    contaComoCoberto: false,
    prioridade: 100,
  },
  [VENCIDO]: {
    id: VENCIDO,
    rotulo: 'Verificação vencida',
    contaComoCoberto: false,
    prioridade: 70,
  },
  [UMA_OBSERVACAO]: {
    id: UMA_OBSERVACAO,
    rotulo: 'Uma verificação',
    contaComoCoberto: false,
    prioridade: 40,
  },
  [CONFIRMADO]: {
    id: CONFIRMADO,
    rotulo: 'Confirmada por duas pessoas',
    contaComoCoberto: true,
    prioridade: 0,
  },
  [CONFLITO]: {
    id: CONFLITO,
    rotulo: 'Respostas divergentes',
    contaComoCoberto: false,
    prioridade: 30,
  },
};

const lista = (v) => (Array.isArray(v) ? v : []);

const emMs = (v) => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * O que sabemos sobre a classificação desta rua.
 *
 * As sugestões contadas são as que PASSARAM na checagem de local (a pessoa
 * estava na rua) e não foram recusadas. Uma sugestão enviada de casa não é
 * observação de campo — é palpite, e contá-la como cobertura transformaria o
 * mapa numa enquete.
 *
 * @param {object} args
 * @param {object} args.rua        linha de pavement_streets
 * @param {Array}  [args.sugestoes] linhas de pavement_suggestions da rua
 * @param {Date}   [args.agora]
 */
export const estadoDeCobertura = ({ rua, sugestoes = [], agora = new Date() } = {}) => {
  const limite = agora.getTime() - JANELA_COBERTURA_DIAS * 86400000;

  // Uma pessoa conta uma vez, com a resposta mais recente dela. Sem isto, quem
  // reenviasse duas vezes viraria "duas pessoas independentes" — e a rua ficaria
  // confirmada por uma só.
  const porAutor = new Map();
  for (const s of lista(sugestoes)) {
    if (!s?.user_id || s.status === 'recusada') continue;
    if (s.local_confere === false) continue;
    const quando = emMs(s.created_at);
    if (quando === null) continue;

    const anterior = porAutor.get(s.user_id);
    if (!anterior || quando > anterior.quando) {
      porAutor.set(s.user_id, { quando, resposta: s.resposta ?? null });
    }
  }

  const observacoes = [...porAutor.values()];
  const recentes = observacoes.filter((o) => o.quando >= limite);
  const ultima = observacoes.reduce((max, o) => Math.max(max, o.quando), 0);

  const respostas = new Set(recentes.map((o) => o.resposta).filter(Boolean));
  const contradiz = respostas.size > 1;

  const id = contradiz
    ? CONFLITO
    : recentes.length >= 2
    ? CONFIRMADO
    : recentes.length === 1
    ? UMA_OBSERVACAO
    : observacoes.length > 0
    ? VENCIDO
    : SEM_DADO;

  return {
    ...ESTADOS_DE_COBERTURA[id],
    estado: id,
    ruaId: rua?.id ?? null,
    verificacoesRecentes: recentes.length,
    diasDesdeUltima: ultima
      ? Math.floor((agora.getTime() - ultima) / 86400000)
      : null,
    // A resposta que a comunidade sustenta. Só existe quando há acordo — e é o
    // que a aprovação do embaixador vai comparar com o cadastro atual.
    respostaSustentada: contradiz || recentes.length === 0 ? null : [...respostas][0] || null,
  };
};

/**
 * A cobertura de uma área inteira.
 *
 * @param {Array} ruas  cada uma como { rua, sugestoes }
 * @param {Date}  [agora]
 * @returns {{
 *   total:number, cobertos:number, fracao:number, rotulo:string,
 *   porEstado:object, porBairro:Array, faltando:Array,
 * }}
 */
export const coberturaDaArea = (ruas = [], agora = new Date()) => {
  const itens = lista(ruas).map((r) => ({
    rua: r.rua ?? r,
    estado: estadoDeCobertura({ rua: r.rua ?? r, sugestoes: r.sugestoes, agora }),
  }));

  const total = itens.length;
  const cobertos = itens.filter((i) => i.estado.contaComoCoberto).length;

  const porEstado = itens.reduce((acc, i) => {
    acc[i.estado.estado] = (acc[i.estado.estado] || 0) + 1;
    return acc;
  }, {});

  // O recorte por bairro é a guarda de equidade da §36.15. Um total que sobe
  // concentrando tudo num bairro é uma meta que falhou, e o número único
  // esconderia isso.
  const bairros = new Map();
  for (const i of itens) {
    const chave = i.rua?.bairro_id ?? 'sem_bairro';
    const atual = bairros.get(chave) || {
      bairroId: chave,
      nome: i.rua?.bairro?.name ?? null,
      total: 0,
      cobertos: 0,
    };
    atual.total += 1;
    if (i.estado.contaComoCoberto) atual.cobertos += 1;
    bairros.set(chave, atual);
  }

  return {
    total,
    cobertos,
    fracao: total > 0 ? cobertos / total : 0,
    rotulo: `${cobertos} de ${total} ruas verificadas`,
    porEstado,
    porBairro: [...bairros.values()].map((b) => ({
      ...b,
      fracao: b.total > 0 ? b.cobertos / b.total : 0,
    })),
    // O que ainda falta, mais necessário primeiro. É a lista que alimenta a
    // rota e a meta — e o motivo de `prioridade` existir.
    faltando: itens
      .filter((i) => !i.estado.contaComoCoberto)
      .sort((a, b) => b.estado.prioridade - a.estado.prioridade)
      .map((i) => ({ rua: i.rua, estado: i.estado })),
  };
};

/**
 * O bairro menos coberto da área.
 *
 * Existe para a moderação e para o critério de liberação de fase — NUNCA para
 * a tela pública. Ver `rotuloPublico`.
 */
export const bairroMaisAtrasado = (cobertura) => {
  const comRuas = lista(cobertura?.porBairro).filter((b) => b.total >= 3);
  if (comRuas.length === 0) return null;
  return comRuas.reduce((pior, b) => (b.fracao < pior.fracao ? b : pior));
};

/**
 * O que pode ser dito em tela pública sobre a cobertura.
 *
 * A regra que este arquivo mais precisa proteger: ausência de dado nunca é
 * publicada como ausência de vigilância. "O bairro X é o menos patrulhado" é,
 * numa cidade pequena, um anúncio de onde ninguém está olhando — e o app não
 * pode ser quem o publica (§36.6).
 *
 * O que sai é a necessidade em termos de trabalho ("faltam 7 ruas"), nunca em
 * termos de ausência de gente.
 */
export const rotuloPublico = (cobertura) => {
  if (!cobertura || cobertura.total === 0) {
    return { texto: 'Nenhuma rua mapeada nesta área ainda.', faltam: 0 };
  }

  const faltam = cobertura.total - cobertura.cobertos;
  const pct = Math.round(cobertura.fracao * 100);

  return {
    texto:
      faltam === 0
        ? `Todas as ${cobertura.total} ruas desta área têm verificação recente.`
        : `${cobertura.rotulo} · faltam ${faltam}`,
    percentual: pct,
    faltam,
  };
};
