// A linha do tempo da bronca, com proveniência.
//
// O QUE ESTAVA QUEBRADO
//
// `ReportProgress` desenhava quatro etapas fixas (Recebido, Em análise, Em
// execução, Resolvido) a partir de `report.status`. A tabela `report_timeline`
// existe, é lida em quatro telas — e nunca é escrita em lugar nenhum. O
// componente dizia isso em comentário e caía no último registro como
// aproximação de data.
//
// O efeito é o pior tipo de erro de produto: a barra parece informação e não é.
// "Em execução" não diz quem informou, quando, com base em quê, nem o que
// falta. E "Em análise" fica marcada como concluída por inferência, porque o
// banco não tem status para ela.
//
// O QUE ESTE ARQUIVO FAZ
//
// Monta a sequência de fatos que o app REALMENTE conhece sobre uma bronca, cada
// um carregando cinco respostas (§36.6 do plano de gamificação):
//
//   • quem informou — cidadão, comunidade, moderação, órgão ou sistema;
//   • quando ocorreu;
//   • qual evidência existe;
//   • o que ainda falta;
//   • por que uma solicitação foi recusada ou não encaminhada.
//
// DERIVADO ONDE DÁ, GRAVADO ONDE NÃO DÁ
//
// Mesma escolha da 169 (nível), 198 (impacto) e 199 (resolução): quase tudo sai
// do dado que já existe. Registro vem de `reports`, moderação vem de
// `moderation_status`, validação e verificação vêm de `report_updates` via
// `resolution.js`.
//
// As quatro etapas do meio — encaminhada, recebida, programada, executada — são
// a exceção, e por um motivo que não tem contorno: elas descrevem o que um
// terceiro fez. Nenhuma coluna do app sabe se o ofício saiu, se a prefeitura
// respondeu ou se a obra entrou no cronograma. Inventar isso a partir de
// `status = 'in-progress'` seria exatamente o que a barra antiga fazia. Por
// isso vêm de `report_official_steps`, escrita por quem tem a informação.
//
// "ENCAMINHADA" NUNCA PODE PARECER "RESOLVIDA"
//
// É a regra explícita do plano e a razão de `avisoDeDependencia` existir. Um
// encaminhamento é uma promessa de terceiro; enquanto ele for a etapa mais
// avançada, a tela precisa dizer, em texto, que ninguém confirmou conserto
// nenhum. Sem integração com o poder público, precisa dizer isso também.
//
// SEM BARRA DE PROGRESSO COM DENOMINADOR FALSO
//
// Este módulo não devolve percentual da bronca de propósito. Um "72% concluído"
// cujo denominador é quantidade de apoios, fotos ou etapas — quando a execução
// depende da prefeitura — é ficção apresentada como medida. O que devolve é
// marco factual: o que aconteceu, quando, por quem.

import { estadoDaResolucao } from './resolution.js';

/**
 * Quem informou o fato.
 *
 * Não é "papel do usuário": é origem da informação. A mesma pessoa aparece como
 * `cidadao` ao registrar e como `moderacao` ao aprovar, porque quem lê a linha
 * do tempo precisa saber com que autoridade cada frase foi dita.
 */
export const FONTE_CIDADAO = 'cidadao';
export const FONTE_COMUNIDADE = 'comunidade';
export const FONTE_MODERACAO = 'moderacao';
export const FONTE_ORGAO = 'orgao';
export const FONTE_SISTEMA = 'sistema';

export const ROTULO_DA_FONTE = {
  [FONTE_CIDADAO]: 'Cidadão',
  [FONTE_COMUNIDADE]: 'Comunidade',
  [FONTE_MODERACAO]: 'Moderação da cidade',
  [FONTE_ORGAO]: 'Órgão público',
  [FONTE_SISTEMA]: 'Sistema',
};

/**
 * As etapas, na ordem em que um problema urbano de fato caminha.
 *
 * `dependeDeTerceiro` é a coluna que muda o texto da tela. As quatro etapas
 * marcadas são as que o cidadão não controla — e são justamente as que uma
 * barra de progresso ingênua transformaria em promessa.
 */
export const ETAPAS = [
  { id: 'registrada', rotulo: 'Registrada', dependeDeTerceiro: false },
  { id: 'moderada', rotulo: 'Moderada', dependeDeTerceiro: false },
  { id: 'validada', rotulo: 'Validada em campo', dependeDeTerceiro: false },
  { id: 'encaminhada', rotulo: 'Encaminhada ao órgão', dependeDeTerceiro: true },
  { id: 'recebida', rotulo: 'Recebida pelo órgão', dependeDeTerceiro: true },
  { id: 'programada', rotulo: 'Programada', dependeDeTerceiro: true },
  { id: 'executada', rotulo: 'Executada', dependeDeTerceiro: true },
  { id: 'verificada', rotulo: 'Verificada pela comunidade', dependeDeTerceiro: false },
];

const INDICE_DA_ETAPA = ETAPAS.reduce((acc, e, i) => ({ ...acc, [e.id]: i }), {});

/**
 * As etapas que só um terceiro conhece.
 *
 * Espelha o CHECK de `report_official_steps.etapa` na migração 207. Divergir
 * aqui significaria a tela oferecer uma etapa que o banco recusa — o mesmo erro
 * que a 185 documentou sobre o limite semanal.
 */
export const ETAPAS_OFICIAIS = ['encaminhada', 'recebida', 'programada', 'executada'];

/** Uma solicitação recusada pelo órgão. Não é etapa: é o fim de um caminho. */
export const ETAPA_RECUSADA = 'recusada';

// Etapas criadas pelo webhook do canal carregam diagnostico de entrega,
// periodo do relatorio e, em registros antigos, o endereco de e-mail do
// destinatario. Isso e operacao interna do canal — nao historia publica da
// bronca. O papel `sistema` e gravado pelas duas rotinas automaticas da 222.
export const etapasOficiaisPublicas = (etapas = []) =>
  (Array.isArray(etapas) ? etapas : []).filter(
    (etapa) => etapa?.registrado_por_papel !== 'sistema'
  );

const EMAIL_EM_TEXTO = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export const ocultarEmails = (valor) =>
  typeof valor === 'string' ? valor.replace(EMAIL_EM_TEXTO, '[e-mail oculto]') : valor;

const data = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const texto = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};

const lista = (v) => (Array.isArray(v) ? v : []);

/**
 * Evidência de um fato, no formato que a tela consome.
 *
 * Foto, e só. Um comentário não é evidência de que a obra começou, e tratar
 * texto como prova é o que faz "3 pessoas disseram" virar "está resolvido".
 */
const evidenciaDe = (midias) =>
  lista(midias)
    .map((m) => ({ id: m?.id ?? null, url: texto(m?.url) }))
    .filter((m) => m.url);

/**
 * O evento de registro. Sempre existe — sem ele não há bronca.
 *
 * Distingue quem registrou do zero de quem transformou o sinal de outra pessoa
 * em bronca (`completed_by`), porque a proveniência das duas é diferente mesmo
 * valendo o mesmo em Impacto (`IMPACTO.autor === IMPACTO.missao`).
 */
const eventoDeRegistro = (report) => ({
  id: 'registrada',
  etapa: 'registrada',
  titulo: 'Bronca registrada',
  em: data(report?.created_at),
  fonte: FONTE_CIDADAO,
  autorId: report?.author_id ?? null,
  autorNome: texto(report?.author?.name) || 'Cidadão',
  detalhe: report?.completed_by
    ? 'Um sinal apontado por outra pessoa foi transformado em bronca.'
    : null,
  evidencia: evidenciaDe(report?.report_media),
  motivo: null,
});

/**
 * O evento de moderação.
 *
 * `pending_approval` NÃO vira evento: nada aconteceu ainda, e uma linha
 * "aguardando" na história faz a espera parecer um passo dado. Ela sai como
 * `falta`, que é onde a espera pertence.
 *
 * Aprovação sem data é aprovação mesmo assim. A tabela não guarda `approved_at`
 * e inventar `created_at` como data da aprovação diria que a bronca foi
 * moderada no instante em que foi escrita — falso para toda bronca que esperou
 * na fila. Evento sem data é honesto; data errada não é.
 */
const eventoDeModeracao = (report) => {
  const estado = texto(report?.moderation_status);
  if (!estado || estado === 'pending_approval') return null;

  if (estado === 'rejected') {
    return {
      id: 'moderada',
      etapa: 'moderada',
      titulo: 'Não aprovada pela moderação',
      em: data(report?.rejected_at),
      fonte: FONTE_MODERACAO,
      autorId: null,
      autorNome: ROTULO_DA_FONTE[FONTE_MODERACAO],
      detalhe: texto(report?.rejection_title),
      evidencia: [],
      motivo: texto(report?.rejection_description),
      recusa: true,
    };
  }

  return {
    id: 'moderada',
    etapa: 'moderada',
    titulo: 'Aprovada pela moderação',
    em: data(report?.approved_at),
    fonte: FONTE_MODERACAO,
    autorId: null,
    autorNome: ROTULO_DA_FONTE[FONTE_MODERACAO],
    detalhe: 'A bronca passou a aparecer no mapa e no feed da cidade.',
    evidencia: [],
    motivo: null,
  };
};

/**
 * A validação em campo.
 *
 * É a primeira observação de alguém SEM interesse no desfecho — o mesmo
 * critério de `confirmacoes_independentes` na 199, e pelo mesmo motivo: o autor
 * confirmando o próprio registro não valida coisa nenhuma.
 *
 * Rejeitada não conta. Pendente de moderação conta, igual à 185 e à 199:
 * ignorá-la faria a linha do tempo andar para trás enquanto o moderador não
 * chegasse.
 */
const eventoDeValidacao = (report, atualizacoes) => {
  const interessados = new Set(
    [report?.author_id, report?.completed_by].filter(Boolean)
  );

  const independentes = lista(atualizacoes)
    .filter(
      (u) =>
        u?.author_id &&
        !interessados.has(u.author_id) &&
        u?.status !== 'rejected'
    )
    .sort((a, b) => (data(a.created_at) ?? 0) - (data(b.created_at) ?? 0));

  const primeira = independentes[0];
  if (!primeira) return null;

  return {
    id: `validada-${primeira.id}`,
    etapa: 'validada',
    titulo: 'Confirmada por quem passou no local',
    em: data(primeira.created_at),
    fonte: FONTE_COMUNIDADE,
    autorId: primeira.author_id,
    autorNome: texto(primeira.author?.name) || 'Um cidadão',
    detalhe: texto(primeira.message),
    evidencia: evidenciaDe(primeira.media),
    motivo: null,
  };
};

/**
 * As etapas que vieram de fora.
 *
 * Uma linha de `report_official_steps` por fato. `protocolo` e `orgao` entram no
 * detalhe porque são o que torna a afirmação checável por qualquer pessoa — sem
 * eles, "encaminhada" é só uma palavra que a moderação digitou.
 */
const eventosOficiais = (etapasOficiais) =>
  lista(etapasOficiais)
    .filter((e) => e?.etapa === ETAPA_RECUSADA || ETAPAS_OFICIAIS.includes(e?.etapa))
    .map((e) => {
      const recusa = e.etapa === ETAPA_RECUSADA;
      const rotulo = ETAPAS.find((x) => x.id === e.etapa)?.rotulo;
      const partes = [texto(e.orgao), texto(e.protocolo) && `protocolo ${texto(e.protocolo)}`]
        .filter(Boolean)
        .join(' · ');

      return {
        id: `oficial-${e.id}`,
        etapa: recusa ? 'encaminhada' : e.etapa,
        titulo: recusa ? 'Solicitação recusada pelo órgão' : rotulo,
        em: data(e.ocorreu_em) || data(e.created_at),
        fonte: FONTE_ORGAO,
        autorId: e.registrado_por ?? null,
        autorNome: texto(e.orgao) || ROTULO_DA_FONTE[FONTE_ORGAO],
        detalhe: partes || null,
        evidencia: evidenciaDe(e.media),
        motivo: texto(e.observacao),
        recusa,
      };
    });

/**
 * A verificação pela comunidade.
 *
 * Só entra quando `resolution.js` diz `verificada` — a mesma função que a tela
 * de detalhe, o card do feed e o alerta da patrulha já usam. Duas redações da
 * mesma regra divergem na primeira mudança de quórum.
 */
const eventoDeVerificacao = (report, resolucao, atualizacoes) => {
  if (resolucao?.estado !== 'verificada') return null;

  const ultimaConfirmacao = lista(atualizacoes)
    .filter((u) => u?.update_type === 'solved' && u?.status !== 'rejected')
    .sort((a, b) => (data(b.created_at) ?? 0) - (data(a.created_at) ?? 0))[0];

  const porComunidade = resolucao.via === 'comunidade';

  return {
    id: 'verificada',
    etapa: 'verificada',
    titulo: 'Resolução confirmada',
    em: data(report?.resolved_at) || data(ultimaConfirmacao?.created_at),
    fonte: porComunidade ? FONTE_COMUNIDADE : FONTE_MODERACAO,
    autorId: null,
    autorNome: porComunidade
      ? `${resolucao.confirmacoes} pessoas foram ao local`
      : ROTULO_DA_FONTE[FONTE_MODERACAO],
    detalhe: porComunidade
      ? 'Confirmada por quem não tinha interesse no desfecho.'
      : 'Confirmada por quem responde pela cidade.',
    evidencia: evidenciaDe(ultimaConfirmacao?.media),
    motivo: null,
  };
};

/**
 * O que ainda falta, dito na voz de quem pode fazer.
 *
 * Uma frase só, e sempre a próxima — listar seis pendências é o mesmo que não
 * apontar nenhuma. O texto muda conforme quem manda no passo seguinte, porque
 * "faltam 2 confirmações de quem passar no local" é um pedido e "o órgão ainda
 * não respondeu" é uma informação. Confundir os dois faz o app cobrar do
 * cidadão uma coisa que não é dele.
 */
const oQueFalta = ({ report, resolucao, ultimaEtapa, temEtapaOficial, recusadoPeloOrgao }) => {
  if (report?.moderation_status === 'rejected') {
    return {
      texto: 'Esta bronca não foi aprovada. Veja o motivo acima e envie uma correção.',
      deQuem: 'cidadao',
    };
  }
  if (report?.moderation_status === 'pending_approval') {
    return { texto: 'Aguardando a moderação da cidade.', deQuem: 'moderacao' };
  }
  if (recusadoPeloOrgao) {
    return {
      texto: 'O órgão recusou a solicitação. O motivo está acima.',
      deQuem: 'orgao',
    };
  }
  if (resolucao?.estado === 'verificada') return null;

  if (resolucao?.estado === 'em_verificacao') {
    const faltam = resolucao.faltam;
    return {
      texto:
        faltam === 1
          ? 'Falta 1 confirmação de quem passar no local.'
          : `Faltam ${faltam} confirmações de quem passar no local.`,
      deQuem: 'cidadao',
    };
  }

  if (ultimaEtapa === 'executada') {
    return {
      texto: 'O órgão informou execução. Falta alguém no local confirmar.',
      deQuem: 'cidadao',
    };
  }
  if (temEtapaOficial) {
    return { texto: 'O órgão ainda não informou a próxima etapa.', deQuem: 'orgao' };
  }
  if (ultimaEtapa === 'validada' || ultimaEtapa === 'moderada') {
    return {
      texto: 'Ainda não há registro de encaminhamento a um órgão.',
      deQuem: 'moderacao',
    };
  }
  return { texto: 'Esteve no local? Informe o status atual.', deQuem: 'cidadao' };
};

/**
 * O aviso que impede "encaminhada" de parecer "resolvida".
 *
 * Aparece enquanto a etapa mais avançada depender de terceiro e ninguém tiver
 * confirmado conserto. É o texto que o plano exige literalmente — e a diferença
 * entre um app que informa e um que dá a entender.
 */
const avisoDeDependencia = (ultimaEtapa, resolucao) => {
  if (resolucao?.estado === 'verificada') return null;
  const etapa = ETAPAS.find((e) => e.id === ultimaEtapa);
  if (!etapa?.dependeDeTerceiro) return null;

  return etapa.id === 'executada'
    ? 'O órgão informou que executou. Ninguém confirmou no local ainda — encaminhamento e execução informada não são conserto verificado.'
    : 'Encaminhar não é resolver. A execução depende do órgão público e ainda não foi confirmada por ninguém no local.';
};

/**
 * A linha do tempo inteira.
 *
 * @param {object}  args
 * @param {object}  args.report            a bronca, com author, report_media
 * @param {Array}   [args.atualizacoes]    linhas de report_updates (com media, author)
 * @param {Array}   [args.etapasOficiais]  linhas de report_official_steps
 * @param {Set|Array} [args.moderadores]   ids com poder de fechar (para resolution.js)
 * @param {boolean} [args.integracaoComOrgao]  a cidade tem canal oficial ligado?
 *
 * @returns {{
 *   eventos: Array,
 *   etapaAtual: string,
 *   falta: {texto:string, deQuem:string}|null,
 *   aviso: string|null,
 *   semIntegracao: boolean,
 *   resolucao: object,
 * }}
 */
export const linhaDoTempo = ({
  report,
  atualizacoes = [],
  etapasOficiais = [],
  moderadores,
  integracaoComOrgao = false,
} = {}) => {
  if (!report) {
    return {
      eventos: [],
      etapaAtual: 'registrada',
      falta: null,
      aviso: null,
      semIntegracao: !integracaoComOrgao,
      resolucao: null,
    };
  }

  const resolucao = estadoDaResolucao(report, atualizacoes, { moderadores });

  const eventos = [
    eventoDeRegistro(report),
    eventoDeModeracao(report),
    eventoDeValidacao(report, atualizacoes),
    ...eventosOficiais(etapasOficiais),
    eventoDeVerificacao(report, resolucao, atualizacoes),
  ].filter(Boolean);

  // Ordem: a etapa manda, a data desempata. Um evento sem data fica onde a
  // etapa o coloca em vez de ir para o topo — `new Date(null)` vale zero, e sem
  // este cuidado uma aprovação sem `approved_at` apareceria antes do registro.
  eventos.sort((a, b) => {
    const porEtapa = INDICE_DA_ETAPA[a.etapa] - INDICE_DA_ETAPA[b.etapa];
    if (porEtapa !== 0) return porEtapa;
    if (!a.em || !b.em) return 0;
    return a.em - b.em;
  });

  const recusadoPeloOrgao = eventos.some((e) => e.recusa && e.fonte === FONTE_ORGAO);
  const temEtapaOficial = eventos.some((e) => e.fonte === FONTE_ORGAO && !e.recusa);
  const etapaAtual = eventos[eventos.length - 1]?.etapa ?? 'registrada';

  return {
    eventos,
    etapaAtual,
    falta: oQueFalta({
      report,
      resolucao,
      ultimaEtapa: etapaAtual,
      temEtapaOficial,
      recusadoPeloOrgao,
    }),
    aviso: avisoDeDependencia(etapaAtual, resolucao),
    // Sem canal com a prefeitura, a ausência de etapas oficiais não é atraso do
    // órgão: é ausência de integração. Dizer isso explicitamente é a diferença
    // entre "a prefeitura não respondeu" e "ninguém perguntou a ela".
    semIntegracao: !integracaoComOrgao,
    resolucao,
  };
};

/**
 * Versao para a pagina publica da bronca.
 *
 * A linha completa continua util para administracao e auditoria. No publico,
 * removemos fatos automaticos do transporte do e-mail e mascaramos qualquer
 * endereco que tenha sido digitado em uma etapa manual do orgao.
 */
export const linhaDoTempoPublica = (args = {}) => {
  const resultado = linhaDoTempo({
    ...args,
    etapasOficiais: etapasOficiaisPublicas(args.etapasOficiais),
  });

  return {
    ...resultado,
    eventos: resultado.eventos.map((evento) => (
      evento.fonte === FONTE_ORGAO
        ? {
            ...evento,
            autorNome: ocultarEmails(evento.autorNome),
            detalhe: ocultarEmails(evento.detalhe),
            motivo: ocultarEmails(evento.motivo),
          }
        : evento
    )),
  };
};

/**
 * As duas fotos do "Antes e Depois".
 *
 * Só devolve par quando existem as duas pontas: a foto do registro e a foto de
 * uma confirmação de conserto. Meia comparação é pior que comparação nenhuma —
 * uma foto antiga sozinha ao lado de um espaço vazio sugere que o depois existe
 * e não carregou.
 *
 * A foto do depois vem da atualização `solved` mais recente que NÃO foi
 * rejeitada. `being_solved` fica de fora de propósito: obra em andamento não é
 * o depois de nada, e usá-la faria o par mentir na direção mais perigosa.
 */
export const antesEDepois = ({ report, atualizacoes = [] } = {}) => {
  const antes = evidenciaDe(report?.report_media)[0];
  if (!antes) return null;

  const depois = lista(atualizacoes)
    .filter((u) => u?.update_type === 'solved' && u?.status !== 'rejected')
    .sort((a, b) => (data(b.created_at) ?? 0) - (data(a.created_at) ?? 0))
    .map((u) => ({ midia: evidenciaDe(u.media)[0], atualizacao: u }))
    .find((x) => x.midia);

  if (!depois) return null;

  return {
    antes: { url: antes.url, em: data(report?.created_at) },
    depois: {
      url: depois.midia.url,
      em: data(depois.atualizacao.created_at),
      autorNome: texto(depois.atualizacao.author?.name) || 'Um cidadão',
    },
  };
};
