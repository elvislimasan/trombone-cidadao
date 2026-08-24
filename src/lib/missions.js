// Import relativo, não pelo alias '@/': os testes rodam em `node --test`, que
// não conhece o alias do Vite. É por isso que as outras libs puras deste
// diretório não importam nada — esta precisa da lista de categorias, e o
// caminho relativo funciona nos dois lados.
import { CATEGORIAS_SINAL } from './reportCategories.js';
// PONTOS e PONTOS_POR_ETAPA vêm de patrolGame, não de scoring: scoring já
// importa este arquivo, e o caminho de volta fecharia um ciclo.
import { CONQUISTAS, PONTOS, PONTOS_POR_ETAPA } from './patrolGame.js';

// Central de missões: catálogo e progresso.
//
// Tudo aqui é dado e função pura. Nenhuma tabela de missões, nenhum progresso
// gravado, nenhum job de desbloqueio — mesma escolha da 169 para o nível, da
// 172 para as conquistas e da 174 para o placar de bairro. Mudar "investigue 3
// buracos" para 4 é mudar um número num array: sem backfill, e sem risco de o
// valor gravado divergir da regra de hoje.
//
// AS METAS SÃO PROGRESSIVAS
//
// Cada missão tem uma escada (`alvos`), não uma meta. Cumprir 3 não encerra a
// missão: abre a de 5, depois a de 10. É o que faz a central continuar tendo o
// que oferecer no segundo mês — uma lista de metas únicas se esvazia e vira uma
// tela de troféus, que ninguém reabre.
//
// A escada também é o que dá o primeiro passo curto. "Investigue 25 buracos"
// como meta inicial não convida ninguém; 3 convida, e quem chega lá já sabe
// como se faz.
//
// O NÍVEL ESCONDE, NÃO BLOQUEIA
//
// Missão acima do nível aparece fechada, com o nível que ela pede. Mostrar tudo
// de uma vez transformaria a primeira visita numa lista de doze pendências;
// esconder por completo faria a central parecer vazia e não daria motivo para
// subir de nível.

// ── Onde a missão é cumprida ──────────────────────────────────────────────────
//
// Cada missão aponta para o lugar do app onde se faz aquilo. Sem isso a central
// vira um relatório: diz o que falta e deixa a pessoa procurar sozinha onde
// fazer — e quem abriu a tela querendo agir desiste no meio do caminho.
//
// Só destinos que EXISTEM. Uma missão sem lugar natural fica sem botão, em vez
// de ganhar um que leva a lugar nenhum.

/** Abre o formulário de bronca no feed. O parâmetro já era tratado lá. */
const CADASTRAR = { rotulo: 'Cadastrar bronca', para: '/?criar_bronca=1' };
/** A tela de escolha da categoria — o passo anterior a qualquer patrulha. */
const PATRULHAR = { rotulo: 'Sair em patrulha', para: '/patrulhar' };
const VER_BRONCAS = { rotulo: 'Ver broncas', para: '/' };
/** O modo de conferir os pontos que alguém marcou de passagem. */
const CONFERIR = { rotulo: 'Conferir', para: '/conferir' };

/** Escadas reaproveitadas. Números diferentes por missão seriam ruído. */
const ESCADA_CURTA = [1, 3, 5, 10];
const ESCADA_MEDIA = [3, 5, 10, 25];
const ESCADA_LONGA = [5, 15, 30, 60];

// ⚠️ NEM TODA MISSÃO VALE MEDALHA, E ISSO ESTÁ CERTO POR ORA
//
// `medalhasPor` só aparece nas missões cujo contador tem medalha em CONQUISTAS
// (patrolGame.js). Registrar bronca, comentar, apoiar e compartilhar não têm —
// o catálogo de medalhas nasceu no modo patrulha e ainda não cobre o resto.
//
// Apontar para um contador sem medalha não quebra nada: `medalhasDaMissao`
// devolve lista vazia e o cartão simplesmente não mostra a linha. Mas seria uma
// promessa em silêncio, então essas missões não apontam para nada — e o teste
// "toda missão que declara medalhas encontra pelo menos uma" impede que alguém
// aponte para um contador inexistente por engano.

export const TRILHAS = {
  investigacao: { id: 'investigacao', nome: 'Investigação', ordem: 1 },
  registro: { id: 'registro', nome: 'Registro', ordem: 2 },
  comunidade: { id: 'comunidade', nome: 'Comunidade', ordem: 3 },
  patrulha: { id: 'patrulha', nome: 'Patrulha', ordem: 4 },
};

/**
 * Missões de investigação, uma por categoria.
 *
 * Geradas da lista de categorias em vez de escritas à mão: uma categoria nova
 * entra sozinha, e nenhuma fica esquecida aqui quando alguém acrescentar outra
 * no cadastro.
 *
 * O nível mínimo escalona por posição na lista — buracos e iluminação, que são
 * o grosso das broncas, abrem cedo; as demais aparecem conforme a pessoa sobe.
 */
const missoesDeInvestigacao = CATEGORIAS_SINAL.map((categoria, i) => ({
  id: `investigar_${categoria.id}`,
  trilha: 'investigacao',
  titulo: `Investigue ${categoria.name.toLowerCase()}`,
  descricao: 'Confirme no local se o problema continua lá',
  icone: categoria.icon,
  nivelMinimo: i < 2 ? 1 : i < 4 ? 2 : 3,
  alvos: ESCADA_MEDIA,
  valor: (c) => c.confirmadasPorCategoria?.[categoria.id] ?? 0,
  // A missão conta por categoria, mas cada confirmação também soma no total —
  // então investigar buraco empurra as medalhas de confirmação, que são gerais.
  medalhasPor: 'total_confirmed',
  ganhoPorAcao: PONTOS.atualizacao,
  // Direto para a patrulha DAQUELA categoria: é literalmente a missão.
  acao: { rotulo: 'Patrulhar', para: `/patrulhar/${categoria.id}` },
}));

export const MISSOES = [
  ...missoesDeInvestigacao,

  {
    id: 'registrar_broncas',
    trilha: 'registro',
    titulo: 'Registre broncas',
    descricao: 'Cadastro completo, com foto e descrição',
    icone: '📣',
    nivelMinimo: 1,
    alvos: ESCADA_MEDIA,
    valor: (c) => c.reports_count,
    ganhoPorAcao: PONTOS.bronca,
    acao: CADASTRAR,
  },
  {
    id: 'sinalizar',
    trilha: 'registro',
    titulo: 'Sinalize problemas',
    descricao: 'Um toque no que você vê passando',
    icone: '🚩',
    nivelMinimo: 2,
    alvos: ESCADA_LONGA,
    valor: (c) => c.signals_count,
    medalhasPor: 'signals_count',
    ganhoPorAcao: PONTOS.sinal,
    acao: PATRULHAR,
  },
  {
    id: 'cumprir_missoes',
    trilha: 'registro',
    titulo: 'Registre problemas marcados',
    descricao: 'Vá até um problema que alguém marcou e faça o cadastro completo',
    icone: '🎯',
    nivelMinimo: 2,
    alvos: ESCADA_CURTA,
    valor: (c) => c.missions_count,
    medalhasPor: 'missions_count',
    ganhoPorAcao: PONTOS.missao,
    acao: CONFERIR,
  },
  {
    id: 'auditar',
    trilha: 'registro',
    titulo: 'Confira problemas marcados',
    // AS DUAS RESPOSTAS CONTAM, E É O PONTO DA MISSÃO.
    //
    // Auditar não é registrar bronca: é FECHAR o caso. Um ponto onde o buraco
    // já foi tapado se resolve dizendo que não há nada ali, e isso vale tanto
    // quanto encontrar o problema — some do mapa do mesmo jeito.
    //
    // Contar só os registros faria a missão empurrar para inventar bronca onde
    // não há, que é exatamente o que a migração 190 existe para evitar.
    descricao: 'Responda se o problema está lá — registrando ou dizendo que não há',
    icone: '🔍',
    nivelMinimo: 1,
    alvos: ESCADA_MEDIA,
    valor: (c) => (c.missions_count || 0) + (c.empties_count || 0),
    ganhoPorAcao: PONTOS.vistoria,
    acao: CONFERIR,
  },

  {
    id: 'apoiar',
    trilha: 'comunidade',
    titulo: 'Apoie broncas',
    descricao: 'Bronca com apoio sobe na fila da prefeitura',
    icone: '👍',
    nivelMinimo: 1,
    alvos: ESCADA_LONGA,
    valor: (c) => c.upvotes_given,
    ganhoPorAcao: PONTOS.apoio,
    acao: VER_BRONCAS,
  },
  {
    id: 'comentar',
    trilha: 'comunidade',
    titulo: 'Comente em broncas',
    descricao: 'Conte o que você sabe sobre o problema',
    icone: '💬',
    nivelMinimo: 1,
    alvos: ESCADA_MEDIA,
    valor: (c) => c.comments_count,
    ganhoPorAcao: PONTOS.comentario,
    acao: VER_BRONCAS,
  },
  {
    id: 'compartilhar',
    trilha: 'comunidade',
    titulo: 'Compartilhe broncas',
    descricao: 'Leve o problema para fora do app',
    icone: '📤',
    nivelMinimo: 3,
    alvos: ESCADA_CURTA,
    // Conta o TOQUE em compartilhar, uma vez por conteúdo. Nenhum app consegue
    // saber se a publicação aconteceu — a folha do sistema não devolve isso —,
    // e por isso a missão diz "compartilhe", que é o ato registrado.
    valor: (c) => c.shares_count,
    ganhoPorAcao: 0,
    acao: VER_BRONCAS,
  },

  {
    id: 'patrulhar',
    trilha: 'patrulha',
    titulo: 'Saia em patrulha',
    descricao: 'Com o app ligado, ele avisa o que está por perto',
    icone: '🛡️',
    nivelMinimo: 1,
    alvos: ESCADA_CURTA,
    valor: (c) => c.patrols_count,
    medalhasPor: 'patrols_count',
    ganhoPorAcao: 0,
    acao: PATRULHAR,
  },
  {
    id: 'confirmar_patrulhando',
    trilha: 'patrulha',
    titulo: 'Confirme durante a patrulha',
    descricao: 'Responda os alertas que aparecem no caminho',
    icone: '✅',
    nivelMinimo: 2,
    alvos: ESCADA_MEDIA,
    valor: (c) => c.total_confirmed,
    medalhasPor: 'total_confirmed',
    ganhoPorAcao: PONTOS.atualizacao,
    acao: PATRULHAR,
  },
  {
    id: 'quilometros',
    trilha: 'patrulha',
    titulo: 'Percorra a cidade',
    descricao: 'Quilômetros patrulhados no total',
    icone: '🗺️',
    nivelMinimo: 3,
    alvos: [5000, 15000, 40000, 100000],
    valor: (c) => c.total_distance_meters,
    medalhasPor: 'total_distance_meters',
    ganhoPorAcao: 0,
    acao: PATRULHAR,
    formatar: (v) => `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',')} km`,
  },
];

const CONTADORES_VAZIOS = {
  reports_count: 0,
  comments_count: 0,
  upvotes_given: 0,
  signals_count: 0,
  missions_count: 0,
  empties_count: 0,
  patrols_count: 0,
  total_confirmed: 0,
  total_distance_meters: 0,
  shares_count: 0,
  confirmadasPorCategoria: {},
  registradasPorCategoria: {},
};

/**
 * Etapa atual de uma escada.
 *
 * Devolve o primeiro alvo ainda não alcançado. Alcançados todos, `alvo` é null
 * — a missão está completa, e a tela mostra isso em vez de uma barra cheia que
 * nunca mais mexe.
 *
 * @param {number[]} alvos
 * @param {number} atual
 */
export const etapaAtual = (alvos, atual) => {
  const lista = Array.isArray(alvos) ? alvos : [];
  const indice = lista.findIndex((alvo) => atual < alvo);

  if (indice === -1) {
    return {
      etapa: lista.length,
      etapas: lista.length,
      alvo: null,
      anterior: lista[lista.length - 1] ?? 0,
      completa: true,
    };
  }

  return {
    etapa: indice + 1,
    etapas: lista.length,
    alvo: lista[indice],
    // O piso da etapa: a barra mede o trecho ATUAL, não o caminho inteiro.
    // Sem isso, quem está em 4 de uma escada 3→5 veria a barra quase cheia por
    // causa do que já fez, e o passo seguinte pareceria a um empurrão de nada.
    anterior: indice === 0 ? 0 : lista[indice - 1],
    completa: false,
  };
};

/**
 * Estado de cada missão para os contadores e o nível dados.
 *
 * @param {object} contadores  saída de `get_mission_counters`, normalizada
 * @param {number} nivel       nível atual do usuário (1-4)
 */
/**
 * As medalhas que uma missão empurra.
 *
 * Derivado, não escrito à mão: missão e medalha declaram o mesmo `contador`, e
 * o cruzamento é este `filter`. Uma medalha nova sobre um contador que já
 * existe passa a aparecer no cartão sozinha — que é exatamente o que uma lista
 * mantida na mão deixaria de fazer no dia em que alguém esquecesse de atualizá-la.
 *
 * `conquistada` sai do contador de verdade, então a mesma medalha aparece
 * apagada depois de ganha em vez de sumir: some, e o cartão passa a prometer
 * menos do que prometia ontem, sem explicação.
 */
export const medalhasDaMissao = (missao, c) => {
  if (!missao.medalhasPor) return [];
  return CONQUISTAS.filter((q) => q.contador === missao.medalhasPor).map((q) => ({
    id: q.id,
    nome: q.nome,
    emoji: q.emoji,
    alvo: q.alvo,
    conquistada: (Number(c?.[q.contador]) || 0) >= q.alvo,
  }));
};

export const avaliarMissoes = (contadores, nivel = 1) => {
  const c = { ...CONTADORES_VAZIOS, ...(contadores || {}) };
  const nivelAtual = Number(nivel) || 1;

  return MISSOES.map((m) => {
    const atual = Math.max(0, Number(m.valor(c)) || 0);
    const escada = etapaAtual(m.alvos, atual);
    const bloqueada = nivelAtual < m.nivelMinimo;

    const formatar = m.formatar || ((v) => String(v));
    const faltam = escada.alvo == null ? 0 : Math.max(0, escada.alvo - atual);

    return {
      id: m.id,
      trilha: m.trilha,
      titulo: m.titulo,
      descricao: m.descricao,
      icone: m.icone,
      nivelMinimo: m.nivelMinimo,
      bloqueada,
      atual,
      faltam,
      alvo: escada.alvo,
      etapa: escada.etapa,
      etapas: escada.etapas,
      completa: escada.completa,
      acao: m.acao ?? null,
      // 0–1 dentro da ETAPA atual, não da escada inteira.
      progresso: escada.completa
        ? 1
        : Math.min(
            1,
            Math.max(0, (atual - escada.anterior) / (escada.alvo - escada.anterior))
          ),
      rotulo: escada.completa
        ? `${formatar(atual)} — tudo concluído`
        : `${formatar(atual)} / ${formatar(escada.alvo)}`,

      // O que a etapa rende. São duas parcelas, e somá-las numa só esconderia
      // a que o app já paga hoje:
      //
      //   • `xpEtapa` é o bônus por vencer a etapa — 15, igual para todas;
      //   • `xpPorAcao` é o que cada ação da missão já vale por si.
      //
      // Uma etapa de "Registre broncas" com 2 faltando rende 15 + 2×10 = 35.
      // Mostrar só o 15 faria a missão parecer valer menos que o trabalho solto.
      xpEtapa: PONTOS_POR_ETAPA,
      xpPorAcao: m.ganhoPorAcao ?? 0,
      xpAteAEtapa: escada.completa
        ? 0
        : PONTOS_POR_ETAPA + faltam * (m.ganhoPorAcao ?? 0),

      medalhas: medalhasDaMissao(m, c),
    };
  });
};

/**
 * Missões agrupadas por trilha, prontas para a tela.
 *
 * Dentro de cada trilha: as disponíveis primeiro, depois as completas, e as
 * bloqueadas por último. Quem abre a central quer ver o que dá para fazer
 * agora — troféu e cadeado não são chamada para ação.
 */
export const missoesPorTrilha = (contadores, nivel = 1) => {
  const avaliadas = avaliarMissoes(contadores, nivel);
  const peso = (m) => (m.bloqueada ? 2 : m.completa ? 1 : 0);

  return Object.values(TRILHAS)
    .sort((a, b) => a.ordem - b.ordem)
    .map((trilha) => ({
      ...trilha,
      missoes: avaliadas
        .filter((m) => m.trilha === trilha.id)
        .sort((a, b) => peso(a) - peso(b) || b.progresso - a.progresso),
    }))
    .filter((t) => t.missoes.length > 0);
};

/** Quantas etapas de missão já foram vencidas ao todo. */
export const etapasConcluidas = (contadores, nivel = 1) =>
  avaliarMissoes(contadores, nivel).reduce(
    (soma, m) => soma + (m.completa ? m.etapas : m.etapa - 1),
    0
  );

// ── O que mudou ───────────────────────────────────────────────────────────────

/**
 * Missões que avançaram entre dois momentos.
 *
 * É o que a animação global consome: depois de registrar uma bronca, comparar
 * o antes com o depois diz exatamente o que dizer — "Investigue buracos 1/3" —
 * em vez de um genérico "boa!".
 *
 * Ordena pelo que mais merece a tela: etapa vencida primeiro, depois o avanço
 * mais próximo de fechar. Só uma aparece por vez; duas ao mesmo tempo viram
 * ruído e nenhuma é lida.
 *
 * O nível é irrelevante aqui de propósito. Uma missão bloqueada progride
 * igual — o cadeado é da vitrine, não do progresso — e esconder o avanço dela
 * faria a pessoa achar que a ação não contou.
 *
 * @param {object} antes    contadores anteriores
 * @param {object} depois   contadores atuais
 * @returns {Array<{id,titulo,icone,de,para,alvo,etapa,etapas,venceuEtapa,completou,progresso}>}
 */
export const avancosEntre = (antes, depois) => {
  if (!antes || !depois) return [];

  const mapa = new Map(avaliarMissoes(antes, 99).map((m) => [m.id, m]));

  return avaliarMissoes(depois, 99)
    .map((agora) => {
      const era = mapa.get(agora.id);
      if (!era || agora.atual <= era.atual) return null;

      return {
        id: agora.id,
        titulo: agora.titulo,
        icone: agora.icone,
        de: era.atual,
        para: agora.atual,
        alvo: agora.alvo,
        etapa: agora.etapa,
        etapas: agora.etapas,
        progresso: agora.progresso,
        rotulo: agora.rotulo,
        // Passou de degrau nesta ação.
        venceuEtapa: agora.etapa > era.etapa || (agora.completa && !era.completa),
        // Venceu o último degrau: a missão inteira acabou.
        completou: agora.completa && !era.completa,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        Number(b.completou) - Number(a.completou) ||
        Number(b.venceuEtapa) - Number(a.venceuEtapa) ||
        b.progresso - a.progresso
    );
};
