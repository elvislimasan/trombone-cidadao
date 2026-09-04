// A revisita de 28 dias.
//
// "Faz 28 dias que você registrou este problema. Como ele está agora?"
//
// POR QUE ESTE ARQUIVO EXISTE
//
// O app pede contribuição nova o tempo todo e nunca pergunta o que aconteceu
// com a antiga. O resultado é um mapa que envelhece: a bronca de março continua
// "pendente" porque ninguém voltou lá, não porque o buraco continua.
//
// O FixMyStreet resolve isso com um retorno após quatro semanas, e a escolha
// por trás do número importa mais que o número: é uma alternativa a exigir uso
// diário. Uma pergunta, uma vez, sobre algo que a pessoa já se importou o
// bastante para registrar.
//
// OPT-IN, E POR BRONCA
//
// Quem responde decide se quer ser perguntado de novo — e a decisão vale para
// aquela bronca, não para a conta. Silêncio não vira recusa: quem ignorou o
// convite não optou por nada, e tratar ausência como "não quer" é a forma
// silenciosa de o produto decidir pelo usuário.
//
// A RESPOSTA VIRA `report_updates`, NÃO UMA TABELA NOVA
//
// Esta é a decisão que sustenta o resto. "Continua igual" e "foi resolvido" são
// observações de campo, e observação de campo já tem casa: `report_updates`,
// com moderação (108), limite semanal (185), quórum de resolução (199) e
// crédito de Impacto (198) funcionando em cima dela.
//
// Uma tabela própria de respostas seria uma segunda verdade sobre o estado da
// rua — e a primeira vez que as duas divergissem, ninguém saberia qual olhar.
//
// `report_revisits` guarda só o que a outra não sabe responder: a quem
// perguntamos, quando, e se a pessoa quer o próximo lembrete.

/** O intervalo. Mesmo do FixMyStreet, e o mesmo da função `revisitas_pendentes` da 207. */
export const DIAS_PARA_REVISITA = 28;

/**
 * As cinco respostas de um toque.
 *
 * `updateType` null é o ponto inteiro de "não consigo verificar": a resposta
 * honesta de quem se mudou, está sem tempo ou não conseguiu chegar. Ela encerra
 * o convite sem afirmar nada sobre a rua — e é por isso que precisa existir. Um
 * formulário sem saída honesta produz a resposta mais fácil, não a verdadeira.
 *
 * `piorou` também vira `still_here`, e a nota carrega a diferença. Não há
 * `update_type` para agravamento no banco, e inventar um aqui faria a tela
 * oferecer um valor que o CHECK da 102 recusa.
 */
export const RESPOSTAS = [
  {
    id: 'igual',
    rotulo: 'Continua igual',
    updateType: 'still_here',
    nota: null,
    fotoRecomendada: false,
  },
  {
    id: 'piorou',
    rotulo: 'Piorou',
    updateType: 'still_here',
    nota: 'Piorou desde o registro.',
    fotoRecomendada: true,
  },
  {
    id: 'melhorou',
    rotulo: 'Melhorou',
    updateType: 'being_solved',
    nota: 'Melhorou, mas ainda não está resolvido.',
    fotoRecomendada: true,
  },
  {
    id: 'resolvido',
    rotulo: 'Foi resolvido',
    updateType: 'solved',
    nota: null,
    fotoRecomendada: true,
  },
  {
    id: 'nao_consigo_verificar',
    rotulo: 'Não consigo verificar',
    updateType: null,
    nota: null,
    fotoRecomendada: false,
  },
];

const POR_ID = RESPOSTAS.reduce((acc, r) => ({ ...acc, [r.id]: r }), {});

export const respostaDe = (id) => POR_ID[id] || null;

/**
 * O que enviar quando a pessoa responde.
 *
 * Devolve `atualizacao: null` para "não consigo verificar" — nada vai para
 * `report_updates`, e o convite se encerra mesmo assim. Registrar uma
 * observação vazia como se fosse observação seria pior que não perguntar.
 *
 * @param {object} args
 * @param {string} args.respostaId
 * @param {object} args.report
 * @param {string} [args.mensagem]  texto que a pessoa escreveu, se escreveu
 * @returns {{
 *   revisita: {report_id:string, resposta:string, respondida_em:string},
 *   atualizacao: {report_id:string, update_type:string, message:string|null}|null,
 * }|null}
 */
export const envioDaRevisita = ({ respostaId, report, mensagem = '' } = {}) => {
  const resposta = respostaDe(respostaId);
  if (!resposta || !report?.id) return null;

  const escrito = typeof mensagem === 'string' ? mensagem.trim() : '';

  return {
    revisita: {
      report_id: report.id,
      resposta: resposta.id,
      respondida_em: new Date().toISOString(),
    },
    atualizacao: resposta.updateType
      ? {
          report_id: report.id,
          update_type: resposta.updateType,
          // A nota do catálogo vem primeiro porque é ela que carrega a
          // diferença entre "igual" e "piorou", que o `update_type` perde.
          message: [resposta.nota, escrito].filter(Boolean).join(' ') || null,
        }
      : null,
  };
};

/**
 * Quantos dias uma bronca está parada.
 *
 * Conta do ÚLTIMO fato conhecido, não do registro. Uma bronca atualizada ontem
 * não está parada há 28 dias, e perguntar "como está agora?" sobre algo que
 * acabou de ser respondido é o tipo de aviso que ensina a pessoa a ignorar
 * avisos.
 *
 * Espelha o `greatest(...)` de `revisitas_pendentes` na 207.
 */
export const diasParada = (report, atualizacoes = [], agora = new Date()) => {
  if (!report?.created_at) return 0;

  const datas = [new Date(report.created_at).getTime()];
  for (const u of Array.isArray(atualizacoes) ? atualizacoes : []) {
    if (!u?.created_at || u.status === 'rejected') continue;
    datas.push(new Date(u.created_at).getTime());
  }

  const ultimo = Math.max(...datas.filter((d) => Number.isFinite(d)));
  if (!Number.isFinite(ultimo)) return 0;

  return Math.max(0, Math.floor((agora.getTime() - ultimo) / 86400000));
};

/**
 * Esta bronca merece o convite agora?
 *
 * Espelha as exclusões de `revisitas_pendentes` (207). Existe do lado do
 * cliente para a tela não montar um convite que o servidor não devolveria — e
 * porque a lista de revisitas vem do RPC, mas a tela de detalhe precisa decidir
 * sozinha se mostra o convite ali.
 */
export const cabeRevisita = ({
  report,
  atualizacoes = [],
  user,
  jaConvidado = false,
  recusouLembrete = false,
  agora = new Date(),
} = {}) => {
  if (!report || !user?.id) return false;
  if (report.author_id !== user.id) return false;
  if (!['pending', 'in-progress'].includes(report.status)) return false;
  if ((report.moderation_status || 'approved') !== 'approved') return false;
  if (jaConvidado || recusouLembrete) return false;

  return diasParada(report, atualizacoes, agora) >= DIAS_PARA_REVISITA;
};

/**
 * O texto do convite.
 *
 * Sem culpa, de propósito (princípio 13: o produto não fabrica culpa). Diz há
 * quanto tempo, não "você abandonou" — quem registrou já fez a parte difícil.
 */
export const convite = (dias) => {
  const d = Math.max(DIAS_PARA_REVISITA, Math.floor(Number(dias) || 0));
  const tempo =
    d >= 60 ? `${Math.floor(d / 30)} meses` : d >= 30 ? 'mais de um mês' : `${d} dias`;

  return {
    titulo: `Faz ${tempo} que você registrou isto.`,
    pergunta: 'Como está agora?',
    rodape: 'Uma resposta de um toque já ajuda. Foto é opcional.',
  };
};
