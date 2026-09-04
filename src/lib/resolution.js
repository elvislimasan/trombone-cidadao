// Confirmação cruzada da resolução.
//
// Uma bronca não fecha porque qualquer um disse que fechou. Fecha quando quem
// tem autoridade fecha, ou quando gente sem interesse na história foi ao local
// e disse a mesma coisa.
//
// O QUE JÁ EXISTIA, E POR QUE BASTA
//
// Não há tabela nova aqui. A confirmação de campo já é uma linha de
// `report_updates` com `update_type = 'solved'` — é o que o modal de
// atualização grava, e é o que o modo patrulha manda com um toque. O que
// faltava não era o dado: era alguém contar.
//
// Mesma escolha da 169 para o nível e da 172 para as conquistas: estado
// derivado, nunca gravado. Mudar o quórum de 2 para 3 é mudar o número abaixo —
// sem migração, sem backfill, e sem risco de uma bronca ficar marcada como
// verificada por uma regra que não existe mais.
//
// MODERAÇÃO FECHA SOZINHA. O RESTO PRECISA DE DUAS PESSOAS.
//
// A regra de admin não muda: admin e embaixador marcam 'solved' e a bronca vai
// direto para 'resolved'. É o que `enviarAtualizacaoDeBronca` já faz hoje
// (`updateType === 'solved' && user.is_admin`), e é o que sustenta a operação —
// o embaixador da cidade é quem fala com a prefeitura e quem responde pelo mapa.
//
// O caminho comunitário entra POR CIMA desse, não no lugar dele. Ele existe
// para a bronca que ninguém da moderação foi conferir, que é a maioria numa
// cidade grande — e é a razão de a verificação existir.
//
// REIVINDICAÇÃO NÃO É CONFIRMAÇÃO
//
// Quem registrou a bronca tem interesse no desfecho: a voz dele ABRE a
// verificação, não a encerra. Por isso `status = 'pending_resolution'` (que o
// app já usa desde a 104) deixa de ser um limbo e passa a significar uma coisa
// só: alguém afirmou que acabou e estamos conferindo.

/** Quem fechou a bronca. */
export const VIA_REGISTRO = 'registro';
export const VIA_MODERACAO = 'moderacao';
export const VIA_COMUNIDADE = 'comunidade';

/**
 * Quantas confirmações independentes fecham uma bronca SEM moderação.
 *
 * Dois, não três: em bairro com pouca gente, três confirmações significam uma
 * bronca que nunca fecha — e bronca que nunca fecha é pior que bronca fechada
 * cedo demais, porque o mapa para de refletir a rua.
 *
 * Dois, não um: um só reproduz o problema que a verificação existe para
 * resolver, com um passo a mais.
 */
export const QUORUM_CONFIRMACOES = 2;

/** Só este tipo de atualização fala sobre o fim do problema. */
const TIPO_RESOLVIDO = 'solved';

/**
 * Atualizações que contam.
 *
 * Rejeitada não conta — a moderação já disse que aquilo não aconteceu.
 * Pendente CONTA: o mesmo critério da 185, e pelo mesmo motivo. Uma confirmação
 * de campo que espera moderação é informação que existe; ignorá-la faria a barra
 * de verificação andar para trás quando o moderador demorasse.
 */
const contaParaVerificacao = (u) =>
  u?.update_type === TIPO_RESOLVIDO && u?.status !== 'rejected';

/**
 * Quem tem interesse no desfecho da bronca.
 *
 * `completed_by` entra porque quem transformou o sinal em bronca é dono do
 * registro tanto quanto o autor.
 */
const ehParteInteressada = (autorId, report) =>
  !!autorId && (autorId === report?.author_id || autorId === report?.completed_by);

const comoSet = (v) =>
  v instanceof Set ? v : new Set(Array.isArray(v) ? v : []);

/**
 * Estado da resolução de uma bronca.
 *
 * @param {object} report              a bronca (author_id, completed_by, status)
 * @param {Array}  atualizacoes        linhas de report_updates da bronca
 * @param {object} [opts]
 * @param {Set<string>|Array<string>} [opts.moderadores]  ids com poder de fechar
 * @returns {{
 *   estado: 'aberta'|'em_verificacao'|'verificada',
 *   via: 'registro'|'moderacao'|'comunidade'|null,
 *   confirmacoes: number,
 *   faltam: number,
 *   quorum: number,
 *   progresso: number,
 *   reivindicada: boolean,
 *   reivindicadaPor: 'autor'|null,
 *   confirmadaPor: string[],
 * }}
 */
export const estadoDaResolucao = (report, atualizacoes = [], opts = {}) => {
  const moderadores = comoSet(opts.moderadores);

  const relevantes = (Array.isArray(atualizacoes) ? atualizacoes : []).filter(
    contaParaVerificacao
  );

  // Um usuário confirma UMA vez, por mais que mande dez linhas. Sem o Set, o
  // quórum cairia com duas atualizações da mesma pessoa em semanas diferentes —
  // que é exatamente o que a policy de 7 dias permite.
  const confirmadores = new Set();
  let moderacaoFechou = false;
  let reivindicadaPor = null;

  for (const u of relevantes) {
    const autor = u.author_id;
    if (!autor) continue;

    // A moderação vem primeiro: um admin que também é autor da bronca fecha
    // como admin. A autoridade é do papel, não da relação com o registro.
    if (moderadores.has(autor)) {
      moderacaoFechou = true;
      continue;
    }
    if (ehParteInteressada(autor, report)) {
      reivindicadaPor = 'autor';
      continue;
    }
    confirmadores.add(autor);
  }

  const confirmacoes = confirmadores.size;
  const gravadaComoResolvida = report?.status === 'resolved';
  const atingiuQuorum = confirmacoes >= QUORUM_CONFIRMACOES;

  // `resolved` no banco vence a contagem: broncas fechadas antes desta regra
  // existir não têm confirmação nenhuma, e reabri-las em massa seria reescrever
  // o passado por causa de um critério novo.
  //
  // A ordem das vias importa para o rótulo, não para o resultado: entre "a
  // prefeitura fechou" e "dois vizinhos confirmaram", a primeira é a informação
  // que muda o que o leitor entende.
  const via = moderacaoFechou
    ? VIA_MODERACAO
    : atingiuQuorum
    ? VIA_COMUNIDADE
    : gravadaComoResolvida
    ? VIA_REGISTRO
    : null;

  // QUALQUER fala sobre o fim abre a verificação — inclusive a primeira
  // confirmação de um vizinho, sem que ninguém tenha reivindicado antes.
  //
  // É o caso mais comum do modo patrulha: alguém passa na rua, vê que o buraco
  // sumiu e responde o alerta. Sem esta linha, a bronca continuaria "aberta" com
  // uma confirmação já dada — e a tela não teria como pedir a segunda, que é o
  // único passo que falta para fechar.
  const estado = via
    ? 'verificada'
    : confirmacoes > 0 || reivindicadaPor || report?.status === 'pending_resolution'
    ? 'em_verificacao'
    : 'aberta';

  return {
    estado,
    via,
    confirmacoes,
    quorum: QUORUM_CONFIRMACOES,
    faltam: Math.max(0, QUORUM_CONFIRMACOES - confirmacoes),
    progresso: Math.min(1, confirmacoes / QUORUM_CONFIRMACOES),
    reivindicada: estado !== 'aberta',
    reivindicadaPor,
    confirmadaPor: [...confirmadores],
  };
};

/**
 * Esta pessoa pode confirmar a resolução desta bronca agora?
 *
 * Serve para decidir se o botão aparece — e o mais importante é o que ele NÃO
 * pode fazer: oferecer a confirmação a quem tem interesse no resultado. Um
 * botão que aparece e depois recusa é pior que botão nenhum (foi o que a 185
 * documentou sobre o limite semanal).
 *
 * Admin é a exceção, pelo mesmo motivo de sempre: para ele o botão não é uma
 * confirmação, é o fechamento.
 */
export const podeConfirmarResolucao = (user, report, atualizacoes = []) => {
  if (!user?.id || !report) return false;
  if (report.status === 'resolved') return false;
  if (user.is_admin) return true;
  if (ehParteInteressada(user.id, report)) return false;

  return !estadoDaResolucao(report, atualizacoes).confirmadaPor.includes(user.id);
};

/**
 * Frase de estado para a tela.
 *
 * Fica aqui, e não no componente, porque a tela de detalhe, o cartão do feed e
 * o alerta da patrulha dizem a mesma coisa — e três redações da mesma regra
 * divergem na primeira mudança de quórum.
 */
export const rotuloDaVerificacao = (estadoResolucao) => {
  if (!estadoResolucao) return null;
  const { estado, via, confirmacoes, faltam } = estadoResolucao;

  if (estado === 'verificada') {
    if (via === VIA_COMUNIDADE) {
      return {
        titulo: 'Resolução confirmada',
        detalhe: `${confirmacoes} pessoas foram ao local e confirmaram`,
        tom: 'resolvido',
      };
    }
    return {
      titulo: 'Resolução confirmada',
      detalhe:
        via === VIA_MODERACAO
          ? 'Confirmada pela moderação da cidade'
          : 'Registrada como resolvida',
      tom: 'resolvido',
    };
  }

  if (estado === 'em_verificacao') {
    return {
      titulo: 'Alguém diz que foi resolvido',
      detalhe:
        faltam === 1
          ? 'Falta 1 confirmação de quem passar no local'
          : `Faltam ${faltam} confirmações de quem passar no local`,
      tom: 'andamento',
    };
  }

  return null;
};
