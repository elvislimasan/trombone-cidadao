// Pavimentação cidadã: sugestão, não edição.
//
// A REGRA QUE DEFINE O FLUXO INTEIRO
//
// "O cidadão envia uma sugestão, não edita a base oficial" (§36.7). O mapa de
// pavimentação é usado para conversar com a prefeitura; uma base que qualquer
// conta pode alterar deixa de servir para isso no dia em que a primeira
// alteração errada aparecer num relatório.
//
// O caminho é o do plano, e cada etapa tira uma forma de errar:
//
//   sugestão → checagem automática de local → revisão independente →
//   aprovação do embaixador/admin → atualização da rua
//
//   • checagem de local  tira o palpite de quem respondeu de casa;
//   • revisão independente tira o erro sincero de uma pessoa só;
//   • aprovação          tira a alteração que ninguém responsável viu.
//
// UMA PERGUNTA SÓ, E EM ÁREA PEQUENA
//
// "Começar com uma única pergunta, por exemplo: 'a classificação continua
// correta?', em uma área pequena. Alterar geometria, nome, CEP ou legislação não
// pertence ao mesmo fluxo" (§36.7).
//
// A tentação aqui é grande: quem está na rua vê que o nome está errado, que o
// traçado passa na quadra errada, que o CEP não bate. Aceitar tudo faria o
// primeiro piloto ser um editor de cadastro operado por desconhecidos — e um
// erro de geometria não tem como ser revisado por quem não está lá.
//
// O que não cabe na pergunta vira pedido de auditoria (`report_audit_requests`,
// migração 212), que é onde reclamação sobre cadastro já tem destino.
//
// A PERGUNTA É CEGA
//
// "Em vez de 'continua pavimentada?', perguntar 'qual pavimento você observa?' e
// revelar o dado anterior apenas depois da resposta" (§36.5). A primeira forma
// colhe concordância; a segunda colhe observação. A diferença aparece
// justamente nas ruas em que o cadastro está errado — que são as únicas em que
// a pergunta valeria a pena.

/**
 * Até onde a resposta conta como observação de campo.
 *
 * 60 m, e não os 100 m da regra de presença da patrulha (migração 173): uma rua
 * é longa e estreita, e o que importa é estar NELA, não perto dela. A 100 m de
 * uma esquina a pessoa pode estar na rua paralela, olhando outro pavimento.
 *
 * A checagem final é do servidor, sempre. Esta constante existe para a tela não
 * oferecer o que o banco vai recusar — o mesmo papel que `RAIO_PRESENCA_M` tem
 * em `usePatrolSignals`.
 */
export const RAIO_DE_OBSERVACAO_M = 60;

/**
 * As respostas possíveis.
 *
 * São os mesmos três status de `pavementReport.js` (`STATUS_DE_RUA`), e isso é
 * obrigatório: a resposta vai virar `pavement_streets.status` se for aprovada.
 * Um vocabulário próprio aqui exigiria tradução na aprovação — e tradução entre
 * vocabulários é onde as classificações se perdem.
 *
 * "Não consigo dizer" existe pelo mesmo motivo de "não consigo verificar" na
 * revisita: sem saída honesta, a pessoa escolhe a opção mais provável, e o
 * palpite entra no mapa com cara de observação.
 */
export const RESPOSTAS_DE_PAVIMENTO = [
  { id: 'paved', rotulo: 'Pavimentada', detalhe: 'Asfalto, paralelepípedo, concreto ou intertravado em toda a extensão.' },
  { id: 'partially_paved', rotulo: 'Parcialmente pavimentada', detalhe: 'Uma parte tem pavimento e outra não.' },
  { id: 'unpaved', rotulo: 'Sem pavimentação', detalhe: 'Terra, cascalho ou barro.' },
  { id: 'nao_sei', rotulo: 'Não consigo dizer', detalhe: 'Não deu para ver a rua inteira.' },
];

/** A pergunta. Uma só, e sempre a mesma — é o que torna as respostas comparáveis. */
export const PERGUNTA = {
  id: 'classificacao',
  texto: 'Qual pavimento você observa nesta rua?',
  ajuda: 'Responda pelo que está vendo agora. Mostramos o que já estava registrado depois.',
};

/**
 * O que fazer com o que NÃO cabe na pergunta.
 *
 * Nome errado, traçado errado, CEP errado: tudo vira auditoria de cadastro, e
 * nada vira edição. É a válvula que permite a pergunta ser estreita sem que a
 * pessoa que viu o erro fique sem canal.
 */
export const FORA_DO_ESCOPO = {
  rotulo: 'O nome, o traçado ou o CEP estão errados',
  motivoDeAuditoria: 'ponto_errado',
  texto:
    'Isso não entra por aqui: corrigir cadastro exige quem responde pela cidade. Vamos abrir um pedido de auditoria.',
};

// `Number(null)` é 0, e `Number('')` também. Sem o descarte explícito, "não
// sabemos onde a pessoa está" viraria "ela está a 0 m da rua" — que é o pior
// resultado possível aqui: a checagem de local passaria justamente quando não
// há local para checar.
const numero = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * A pessoa está na rua que está respondendo?
 *
 * Recebe a distância já calculada — quem sabe medir contra um MULTILINESTRING é
 * o PostGIS, não o JavaScript. Aqui só mora o limiar e o texto, para que a tela
 * e o servidor concordem sobre o que é "estar na rua".
 */
export const localConfere = (distanciaM) => {
  const d = numero(distanciaM);
  if (d === null) return { ok: false, motivo: 'sem_posicao' };
  return { ok: d <= RAIO_DE_OBSERVACAO_M, motivo: d <= RAIO_DE_OBSERVACAO_M ? null : 'longe' };
};

/**
 * O que enviar.
 *
 * "Não sei" NÃO vira sugestão. É resposta legítima e não é observação: gravá-la
 * como sugestão faria a rua contar como verificada por alguém que disse não
 * saber.
 *
 * @returns {{sugestao:object|null, auditoria:object|null, motivo:string|null}}
 */
export const envioDaSugestao = ({ respostaId, rua, distanciaM, observacao = '' } = {}) => {
  if (!rua?.id) return { sugestao: null, auditoria: null, motivo: 'sem_rua' };

  if (respostaId === 'fora_do_escopo') {
    return {
      sugestao: null,
      auditoria: {
        street_id: rua.id,
        motivo: FORA_DO_ESCOPO.motivoDeAuditoria,
        observacao: observacao?.trim() || null,
      },
      motivo: null,
    };
  }

  const valida = RESPOSTAS_DE_PAVIMENTO.some((r) => r.id === respostaId);
  if (!valida) return { sugestao: null, auditoria: null, motivo: 'resposta_invalida' };
  if (respostaId === 'nao_sei') {
    return { sugestao: null, auditoria: null, motivo: 'nao_sei' };
  }

  const local = localConfere(distanciaM);
  if (!local.ok) return { sugestao: null, auditoria: null, motivo: local.motivo };

  return {
    sugestao: {
      street_id: rua.id,
      pergunta: PERGUNTA.id,
      resposta: respostaId,
      distancia_m: numero(distanciaM),
      observacao: observacao?.trim() || null,
    },
    auditoria: null,
    motivo: null,
  };
};

/**
 * O que dizer quando a sugestão não pôde ser enviada.
 *
 * Cada motivo tem um caminho de saída. Uma recusa sem próximo passo é a mesma
 * falha que a rejeição muda de atualização tinha antes da fase 1.
 */
export const RECUSAS = {
  longe: `Você precisa estar na rua para responder (até ${RAIO_DE_OBSERVACAO_M} m dela). Responda quando passar por lá.`,
  sem_posicao: 'Não conseguimos confirmar sua localização. Ative o GPS e tente de novo.',
  nao_sei: 'Tudo bem. Não registramos nada — dizer que não sabe é melhor que chutar.',
  resposta_invalida: 'Escolha uma das opções para enviar.',
  sem_rua: 'Rua não identificada.',
};

/**
 * A sugestão está pronta para virar alteração no cadastro?
 *
 * Duas pessoas independentes, com a MESMA resposta, e a resposta diferente do
 * que está registrado. As três condições importam:
 *
 *   • duas pessoas   — uma só erra de boa-fé, e o cadastro é usado com a
 *                      prefeitura;
 *   • mesma resposta — divergência vira auditoria, não média;
 *   • diferente do atual — concordar com o cadastro não é alteração nenhuma; é
 *                      confirmação, e ela já vale como cobertura sem passar
 *                      pela fila do embaixador.
 *
 * Devolve o que a tela de aprovação precisa mostrar, nunca aplica nada: quem
 * altera a rua é o embaixador, no passo seguinte.
 */
export const prontaParaAprovacao = ({ rua, sugestoes = [] } = {}) => {
  const validas = (Array.isArray(sugestoes) ? sugestoes : []).filter(
    (s) => s?.user_id && s.status !== 'recusada' && s.local_confere !== false
  );

  const porResposta = new Map();
  for (const s of validas) {
    const set = porResposta.get(s.resposta) || new Set();
    set.add(s.user_id);
    porResposta.set(s.resposta, set);
  }

  const comDuas = [...porResposta.entries()].filter(([, autores]) => autores.size >= 2);

  if (comDuas.length > 1) {
    return { pronta: false, motivo: 'conflito', resposta: null, apoios: 0 };
  }
  if (comDuas.length === 0) {
    return { pronta: false, motivo: 'sem_quorum', resposta: null, apoios: 0 };
  }

  const [resposta, autores] = comDuas[0];
  if (resposta === rua?.status) {
    return { pronta: false, motivo: 'ja_confere', resposta, apoios: autores.size };
  }

  return { pronta: true, motivo: null, resposta, apoios: autores.size };
};
