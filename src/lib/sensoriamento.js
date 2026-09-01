// Sensoriamento passivo, com consentimento e confirmação posterior.
//
// ESTA É A MECÂNICA MAIS PERIGOSA DO PLANO INTEIRO, E O ARQUIVO É ESCRITO ASSIM
//
// Tudo aqui existe para limitar o que a funcionalidade pode fazer, não para
// aumentá-la. Se em algum momento uma mudança neste arquivo AMPLIAR a coleta,
// ela está indo na direção errada.
//
// O QUE É COLETADO, E O QUE NÃO É
//
// Coletado: um solavanco. Enquanto uma patrulha está em andamento e a pessoa
// consentiu, o acelerômetro do aparelho aponta um evento pontual — um pico
// vertical compatível com buraco ou lombada — e o app guarda a hora e uma
// coordenada ARREDONDADA.
//
// Não coletado: trajetória, velocidade contínua, áudio, contatos, uso de outros
// apps, nem nada quando a patrulha não está ativa. Não há serviço de fundo, não
// há coleta com o app fechado.
//
// POR QUE A COORDENADA É ARREDONDADA
//
// O princípio 9 pede a menor precisão necessária. Um candidato não precisa saber
// a faixa da via: precisa dizer "por aqui houve um solavanco" para a pessoa
// reconhecer o lugar depois. Quatro casas decimais dão ~11 m, que é o suficiente
// para reconhecer e insuficiente para reconstruir o percurso de alguém.
//
// NADA VIRA BRONCA SOZINHO. NUNCA.
//
// É a regra que o nome da entrega já traz: "com consentimento E CONFIRMAÇÃO
// POSTERIOR". Um candidato é privado do autor, não aparece no mapa, não conta
// para cobertura, não notifica ninguém e não existe para a moderação. Ele só
// vira bronca quando a pessoa olha e diz o que era.
//
// Sem essa regra, o app publicaria buracos que ninguém viu, a partir de um pico
// de acelerômetro que pode ter sido a mochila caindo no banco.
//
// E ELE EXPIRA
//
// Candidato não confirmado é apagado. Guardar indefinidamente um registro de
// "esta pessoa passou por aqui e sacudiu" é exatamente o dado que não deveria
// existir — e a retenção curta é a diferença entre uma fila de tarefas e um
// histórico de deslocamento.
//
// ANTES DE LIGAR ISTO EM PRODUÇÃO
//
// A ANPD recomenda o RIPD antes de iniciar tratamentos de alto risco (§36.17), e
// este é um. `SENSORIAMENTO_LIBERADO` fica falso até que o responsável jurídico
// e o encarregado de dados avaliem — e o código respeita a chave, em vez de
// deixar a decisão para uma configuração que alguém esquece.

/**
 * O portão. Falso até haver RIPD e aval jurídico.
 *
 * Não é uma flag de rollout: é a tradução em código da recomendação da ANPD. Uma
 * funcionalidade que trata dado de localização em segundo plano não começa
 * ligada e depois se documenta.
 */
export const SENSORIAMENTO_LIBERADO = false;

/** Casas decimais guardadas. 4 ≈ 11 m. */
export const CASAS_DECIMAIS = 4;

/** Por quantos dias um candidato não confirmado sobrevive. */
export const RETENCAO_DIAS = 7;

/**
 * O que a pessoa precisa ler ANTES de aceitar.
 *
 * Mora aqui, e não na tela, porque um teste guarda a lista: consentimento
 * informado é o que está escrito, e é fácil uma refatoração de layout perder uma
 * linha sem ninguém notar que perdeu.
 *
 * `limite` são as promessas de NÃO fazer. São elas que tornam o consentimento
 * específico — "aceito coleta de dados" não é consentimento de nada.
 */
export const TERMOS_DO_CONSENTIMENTO = {
  oQueColeta: [
    'Um sinal do acelerômetro quando o aparelho registra um solavanco forte.',
    'A hora do solavanco e uma localização aproximada (cerca de 11 metros).',
  ],
  limite: [
    'Só enquanto uma patrulha estiver em andamento, nunca com o app fechado.',
    'Nunca o seu trajeto: só os pontos de solavanco, separados uns dos outros.',
    'Nunca áudio, nunca imagem, nunca contatos.',
    'Nada é publicado sem você olhar e confirmar o que era.',
  ],
  oQueAcontece: [
    `O ponto fica guardado por até ${RETENCAO_DIAS} dias, só para você.`,
    'Você confirma o que viu, e aí sim vira uma bronca — ou é descartado.',
    'Ninguém da moderação vê um ponto que você não confirmou.',
  ],
  comoSair: [
    'Você pode desligar a qualquer momento, nas preferências.',
    'Ao desligar, os pontos ainda não confirmados são apagados.',
  ],
};

/** Arredonda para a precisão de guarda. */
export const arredondar = (valor) => {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** CASAS_DECIMAIS;
  return Math.round(n * f) / f;
};

/**
 * O pico é forte o bastante para virar candidato?
 *
 * O limiar é alto de propósito. Um limiar baixo geraria dezenas de candidatos
 * por saída, a pessoa pararia de olhar, e a fila viraria — de novo — um monte de
 * dado que ninguém confirma. Poucos candidatos e bons valem mais que muitos
 * candidatos e nenhum.
 *
 * `magnitude` é o módulo da aceleração menos a gravidade, em m/s². 6 é um
 * solavanco que se sente no corpo, não uma irregularidade de asfalto novo.
 */
export const LIMIAR_DE_SOLAVANCO = 6;

/**
 * Intervalo mínimo entre dois candidatos, em milissegundos.
 *
 * Um buraco produz vários picos em sequência (entrada, fundo, saída) e uma rua
 * ruim produz picos o tempo todo. Sem a janela, uma quadra viraria quarenta
 * candidatos do mesmo buraco — e a pessoa desistiria na terceira confirmação.
 */
export const JANELA_ENTRE_EVENTOS_MS = 8000;

/**
 * Deve virar candidato?
 *
 * @param {object} args
 * @param {number} args.magnitude
 * @param {object} args.posicao
 * @param {number} [args.ultimoEventoEm]  timestamp do candidato anterior
 * @param {boolean} args.consentiu
 * @param {boolean} args.patrulhaAtiva
 * @param {number} [args.agora]
 */
export const deveRegistrar = ({
  magnitude,
  posicao,
  ultimoEventoEm = null,
  consentiu,
  patrulhaAtiva,
  agora = Date.now(),
} = {}) => {
  // A ordem das recusas é a ordem da responsabilidade: primeiro o portão legal,
  // depois o consentimento, depois o contexto, e só então o sinal.
  if (!SENSORIAMENTO_LIBERADO) return { ok: false, motivo: 'nao_liberado' };
  if (!consentiu) return { ok: false, motivo: 'sem_consentimento' };
  if (!patrulhaAtiva) return { ok: false, motivo: 'fora_da_patrulha' };

  if (!posicao || !Number.isFinite(posicao.lat) || !Number.isFinite(posicao.lng)) {
    return { ok: false, motivo: 'sem_posicao' };
  }
  if (!(Number(magnitude) >= LIMIAR_DE_SOLAVANCO)) {
    return { ok: false, motivo: 'fraco' };
  }
  if (ultimoEventoEm && agora - ultimoEventoEm < JANELA_ENTRE_EVENTOS_MS) {
    return { ok: false, motivo: 'muito_perto_do_anterior' };
  }

  return { ok: true, motivo: null };
};

/**
 * O candidato, no formato que vai para o banco.
 *
 * Repare no que NÃO está aqui: velocidade, rumo, precisão do GPS, id da
 * patrulha, sequência de leituras. Cada um deles ajudaria a "melhorar a
 * detecção" e cada um aproximaria a tabela de um histórico de deslocamento.
 */
export const candidatoDe = ({ posicao, magnitude, agora = new Date() } = {}) => ({
  lat: arredondar(posicao?.lat),
  lng: arredondar(posicao?.lng),
  // Arredondada para inteiro: a diferença entre 6,2 e 6,7 não muda nada para
  // quem vai confirmar, e guardar a curva completa seria guardar o percurso.
  intensidade: Math.round(Number(magnitude) || 0),
  ocorreu_em: agora.toISOString(),
});

/**
 * As respostas da confirmação posterior.
 *
 * A pergunta é CEGA e aberta: "o que havia aqui?", não "era um buraco?". A
 * segunda forma colhe concordância — e concordância com um palpite de
 * acelerômetro é como um sensor vira fonte de bronca falsa.
 *
 * "Não era nada" é a resposta mais importante da lista. Sem ela, a única forma
 * de fechar um candidato seria afirmar um problema.
 */
export const RESPOSTAS_DO_CANDIDATO = [
  { id: 'buraco', rotulo: 'Um buraco na via', viraBronca: true, categoria: 'buracos' },
  { id: 'outro_problema', rotulo: 'Outro problema', viraBronca: true, categoria: null },
  { id: 'lombada', rotulo: 'Lombada ou obra sinalizada', viraBronca: false },
  { id: 'nada', rotulo: 'Não era nada', viraBronca: false },
  { id: 'nao_lembro', rotulo: 'Não lembro', viraBronca: false },
];

export const respostaDoCandidato = (id) =>
  RESPOSTAS_DO_CANDIDATO.find((r) => r.id === id) || null;

/**
 * O que fazer com a resposta.
 *
 * Nunca cria a bronca sozinho: devolve o RASCUNHO, e quem abre o cadastro é a
 * pessoa — com foto, descrição e a localização do momento em que ela estiver
 * lá. O candidato dá o lugar aproximado e a lembrança, não o registro.
 */
export const envioDaConfirmacao = ({ respostaId, candidato } = {}) => {
  const resposta = respostaDoCandidato(respostaId);
  if (!resposta || !candidato?.id) return null;

  return {
    confirmacao: {
      id: candidato.id,
      resposta: resposta.id,
      confirmado_em: new Date().toISOString(),
    },
    // Rascunho, não bronca. A distinção é a entrega inteira.
    rascunhoDeBronca: resposta.viraBronca
      ? {
          categoria: resposta.categoria,
          lat: candidato.lat,
          lng: candidato.lng,
          origem: 'sensoriamento',
        }
      : null,
  };
};

/**
 * Este candidato ainda vale?
 *
 * Fora da janela de retenção ele não deve ser mostrado nem confirmado — mesmo
 * que a limpeza do banco ainda não tenha rodado. A tela não pode depender de o
 * servidor ter apagado na hora certa.
 */
export const dentroDaRetencao = (candidato, agora = new Date()) => {
  const t = new Date(candidato?.ocorreu_em).getTime();
  if (!Number.isFinite(t)) return false;
  return agora.getTime() - t <= RETENCAO_DIAS * 86400000;
};

/**
 * Os candidatos que a pessoa deve ver.
 *
 * Ordenados do mais recente para o mais antigo: a lembrança de ontem é melhor
 * que a de seis dias atrás, e confirmar o que se lembra é o que mantém a
 * resposta honesta.
 */
export const candidatosPendentes = (candidatos = [], agora = new Date()) =>
  (Array.isArray(candidatos) ? candidatos : [])
    .filter((c) => !c?.confirmado_em && dentroDaRetencao(c, agora))
    .sort((a, b) => new Date(b.ocorreu_em) - new Date(a.ocorreu_em));
