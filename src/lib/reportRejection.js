// Por que a atualização não foi publicada, e o que fazer a respeito.
//
// O QUE ACONTECIA ANTES
//
// A moderação gravava `status = 'rejected'` e mandava uma frase fixa: "não foi
// aprovada por não cumprir as diretrizes". `ReportPage` filtrava a linha da
// lista — inclusive para quem a enviou — e `ReportUpdates.jsx` chegava a
// calcular `isRejected` sem nunca usar.
//
// Do lado de quem foi até a rua, tirou a foto e mandou, a experiência inteira
// era: sumiu, e não dá para saber por quê nem o que corrigir.
//
// É a pior troca possível para um app que depende de trabalho voluntário de
// campo. Uma negativa explicada custa uma frase e ensina; uma negativa muda
// custa a próxima contribuição — o estudo sobre plataformas cívicas citado no
// plano (§36.17) encontrou justamente relação entre resposta justificada e
// participação futura.
//
// POR QUE MOTIVO ESTRUTURADO, E NÃO SÓ TEXTO LIVRE
//
// O texto livre resolve o caso e não resolve o produto. Sem código, ninguém
// consegue perguntar "quantas rejeições são de foto ilegível?" — e sem essa
// resposta ninguém conserta o formulário que produz foto ilegível.
//
// Os dois juntos: o código conta, a nota ensina. Por isso a moderação escreve
// os dois e a tela mostra a nota primeiro.
//
// ESPELHA O CHECK DA MIGRAÇÃO 207
//
// `report_updates_motivo_de_rejeicao_valido` tem esta mesma lista. Divergir
// aqui significa a tela oferecer um motivo que o banco recusa — o erro que a
// 185 documentou sobre o limite semanal, e que a 199 documentou sobre o quórum.

/**
 * Os motivos, com o que o cidadão deve fazer em seguida.
 *
 * `corrigivel` é a coluna que muda a tela: uma foto ilegível se resolve com
 * outra foto, e o botão deve dizer isso. "Conteúdo impróprio" não tem caminho
 * de correção — oferecer "reenviar" ali seria convidar a pessoa a repetir o
 * problema, e depois puni-la de novo.
 *
 * `podeRecorrer` é diferente de `corrigivel`: quem acha que a moderação errou
 * fala com a moderação, mesmo quando não há o que corrigir. Sem isso, um erro
 * de moderação vira decisão final por falta de canal.
 */
export const MOTIVOS_DE_REJEICAO = [
  {
    id: 'fora_do_local',
    rotulo: 'Não parece ser do local da bronca',
    explicacao:
      'A foto ou o relato não bate com o endereço desta bronca.',
    comoCorrigir:
      'Se você esteve no local certo, reenvie com uma foto que mostre alguma referência da rua.',
    corrigivel: true,
    podeRecorrer: true,
  },
  {
    id: 'sem_evidencia',
    rotulo: 'Faltou evidência',
    explicacao: 'O relato afirma uma mudança que nenhuma foto mostra.',
    comoCorrigir: 'Reenvie com uma foto do que você viu.',
    corrigivel: true,
    podeRecorrer: true,
  },
  {
    id: 'evidencia_ilegivel',
    rotulo: 'A foto não permite ver',
    explicacao: 'A imagem está escura, tremida ou distante demais.',
    comoCorrigir:
      'Reenvie uma foto mais próxima e com o problema visível. Se for à noite, vale voltar de dia.',
    corrigivel: true,
    podeRecorrer: true,
  },
  {
    id: 'nao_corresponde',
    rotulo: 'Não corresponde a esta bronca',
    explicacao: 'O que foi relatado é outro problema, não o desta bronca.',
    comoCorrigir:
      'Se for um problema diferente, registre uma bronca nova em vez de atualizar esta.',
    corrigivel: true,
    podeRecorrer: true,
  },
  {
    id: 'duplicada',
    rotulo: 'Já havia sido enviada',
    explicacao: 'Esta mesma informação já estava na bronca.',
    // Duplicata NÃO é erro de quem enviou: a pessoa foi ao local e observou de
    // verdade. Reenviar não ajuda ninguém, e é por isso que aqui não há o que
    // corrigir — mas o texto não pode soar como repreensão.
    comoCorrigir:
      'Não há o que corrigir. A observação já estava registrada por outra pessoa.',
    corrigivel: false,
    podeRecorrer: false,
  },
  {
    id: 'conteudo_improprio',
    rotulo: 'Conteúdo fora das diretrizes',
    explicacao: 'O texto ou a imagem não cumpre as regras de convivência.',
    comoCorrigir: null,
    corrigivel: false,
    podeRecorrer: true,
  },
  {
    id: 'dado_pessoal',
    rotulo: 'Expunha dado pessoal',
    explicacao:
      'A imagem ou o texto mostrava rosto, placa, documento ou endereço de alguém.',
    comoCorrigir:
      'Reenvie enquadrando só o problema, sem pessoas, placas ou documentos legíveis.',
    corrigivel: true,
    podeRecorrer: true,
  },
  {
    id: 'outro',
    rotulo: 'Outro motivo',
    explicacao: 'A moderação explicou o caso na mensagem.',
    comoCorrigir: null,
    corrigivel: true,
    podeRecorrer: true,
  },
];

const POR_ID = MOTIVOS_DE_REJEICAO.reduce((acc, m) => ({ ...acc, [m.id]: m }), {});

/**
 * O motivo de uma rejeição antiga — as que existiam antes da 207.
 *
 * Não inventa causa. "A moderação não registrou o motivo" é a verdade, e dizer
 * a verdade sobre a própria lacuna vale mais que escolher um motivo plausível
 * e errado.
 */
const SEM_MOTIVO_REGISTRADO = {
  id: null,
  rotulo: 'Não publicada',
  explicacao: 'Esta atualização foi recusada antes de o app registrar motivos.',
  comoCorrigir: 'Você pode enviar uma nova atualização quando passar pelo local.',
  corrigivel: true,
  podeRecorrer: true,
};

const texto = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};

/**
 * Tudo que a tela precisa para explicar uma rejeição.
 *
 * A nota do moderador vem antes da explicação genérica de propósito: ela é
 * específica daquele caso e é o que a pessoa realmente precisa ler. A
 * explicação do catálogo entra como complemento, nunca no lugar.
 *
 * @param {object} atualizacao  linha de report_updates
 * @returns {{
 *   rotulo:string, nota:string|null, explicacao:string,
 *   comoCorrigir:string|null, corrigivel:boolean, podeRecorrer:boolean,
 *   em:Date|null,
 * }|null}
 */
export const explicacaoDaRejeicao = (atualizacao) => {
  if (!atualizacao || atualizacao.status !== 'rejected') return null;

  const motivo = POR_ID[atualizacao.rejection_reason] || SEM_MOTIVO_REGISTRADO;
  const em = atualizacao.rejected_at ? new Date(atualizacao.rejected_at) : null;

  return {
    id: motivo.id,
    rotulo: motivo.rotulo,
    nota: texto(atualizacao.rejection_note),
    explicacao: motivo.explicacao,
    comoCorrigir: motivo.comoCorrigir,
    corrigivel: motivo.corrigivel,
    podeRecorrer: motivo.podeRecorrer,
    em: em && !Number.isNaN(em.getTime()) ? em : null,
  };
};

/**
 * Quem enxerga uma atualização rejeitada.
 *
 * Só quem a enviou, e a moderação. Uma rejeição é uma conversa entre os dois —
 * publicá-la para a bronca inteira transformaria um retorno privado num aviso
 * público sobre a pessoa, o que é castigo, não explicação.
 *
 * Espelha a policy `report_updates_autor_ve_a_propria_rejeitada` da 207: o
 * banco também só entrega a linha para o autor.
 */
export const podeVerRejeicao = (atualizacao, user) => {
  if (!atualizacao || atualizacao.status !== 'rejected') return false;
  if (!user?.id) return false;
  return user.is_admin === true || atualizacao.author_id === user.id;
};
