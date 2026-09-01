// Trombone Agora — o catálogo dos acontecimentos e tudo que se deriva deles.
//
// POR QUE O CATÁLOGO NÃO ESTÁ NO BANCO
//
// Mesma divisão que a 179/180 fizeram com missões e a 198 com impacto: o banco
// CONTA, o cliente ROTULA. Mudar "Falta de abastecimento" para "Falta d'água",
// trocar o ícone ou mover um tipo do filtro "Serviços" para "Alertas" não pode
// exigir migração — e uma tabela de tipos exigiria, além de mais uma policy
// invisível ao git (ver o comentário da 202 sobre isso).
//
// O CHECK da 206 é a única coisa que o banco sabe sobre tipos, e ele existe só
// para impedir lixo. A ordem, o rótulo, o ícone e o grupo moram aqui.
//
// O QUE ESTE ARQUIVO NÃO FAZ
//
// Não fala com o Supabase, não importa React e não lê `window`. É o que permite
// testá-lo com `node --test` sem subir nada — e é onde as regras difíceis
// (previsão vencida, divergência da comunidade, montagem da linha do tempo)
// ficam olháveis num arquivo só.

/**
 * Os onze tipos do plano.
 *
 * `pref` é a chave de `user_area_follows` que liga ou desliga o alerta. O
 * mapeamento tem que ser IGUAL ao CASE de `city_event_audience` na 206: se
 * divergirem, a tela mostra um interruptor que não corresponde ao que o banco
 * consulta — e a pessoa desliga algo que continua chegando.
 *
 * `grupo` é o filtro da tela do Agora (o layout: Todos / Alertas / Eventos /
 * Trânsito / Serviços). Não é a mesma coisa que `pref`: "obra emergencial" é
 * filtrada em Serviços mas silenciada por `works_alerts`.
 */
export const TIPOS = [
  { id: 'water_outage',     rotulo: "Falta d'água",         curto: "Falta d'água",     emoji: '💧', pref: 'water_alerts',         grupo: 'alertas'  },
  { id: 'power_outage',     rotulo: 'Interrupção elétrica', curto: 'Falta de energia', emoji: '⚡', pref: 'power_alerts',         grupo: 'alertas'  },
  { id: 'road_block',       rotulo: 'Rua interditada',      curto: 'Interdição',       emoji: '🚧', pref: 'traffic_alerts',       grupo: 'transito' },
  { id: 'traffic',          rotulo: 'Trânsito',             curto: 'Trânsito',         emoji: '🚗', pref: 'traffic_alerts',       grupo: 'transito' },
  { id: 'public_transport', rotulo: 'Transporte público',   curto: 'Transporte',       emoji: '🚌', pref: 'traffic_alerts',       grupo: 'transito' },
  { id: 'weather',          rotulo: 'Alerta climático',     curto: 'Clima',            emoji: '🌧️', pref: 'critical_alerts',      grupo: 'alertas'  },
  { id: 'health',           rotulo: 'Saúde',                curto: 'Saúde',            emoji: '🏥', pref: 'critical_alerts',      grupo: 'servicos' },
  { id: 'construction',     rotulo: 'Obra emergencial',     curto: 'Obra',             emoji: '🏗️', pref: 'works_alerts',         grupo: 'servicos' },
  { id: 'event',            rotulo: 'Evento',               curto: 'Evento',           emoji: '🎉', pref: 'events_alerts',        grupo: 'eventos'  },
  { id: 'public_notice',    rotulo: 'Comunicado',           curto: 'Comunicado',       emoji: '📢', pref: 'public_notice_alerts', grupo: 'servicos' },
  { id: 'other',            rotulo: 'Outro',                curto: 'Outro',            emoji: '📍', pref: 'critical_alerts',      grupo: 'servicos' },
];

const POR_ID = Object.fromEntries(TIPOS.map((t) => [t.id, t]));

/** O tipo, ou um genérico. Nunca `undefined`: a tela não pode quebrar por um
 *  tipo que entrou no banco antes de existir aqui. */
export const tipoDe = (id) =>
  POR_ID[id] || { id: id || 'other', rotulo: 'Acontecimento', curto: 'Acontecimento', emoji: '📍', pref: 'critical_alerts', grupo: 'servicos' };

/** A chave de preferência de um tipo. Espelha o CASE da 206. */
export const preferenciaDoTipo = (id) => tipoDe(id).pref;

/**
 * As preferências de acompanhamento, para a tela de "acompanhar rua".
 *
 * Uma linha por interruptor, e cada uma diz quais tipos silencia. É o que faz a
 * tela conseguir escrever "isso desliga trânsito, interdição e transporte" sem
 * ninguém manter uma segunda lista.
 */
export const PREFERENCIAS = [
  { chave: 'critical_alerts',      rotulo: 'Alertas importantes', descricao: 'Clima, saúde e avisos urgentes' },
  { chave: 'water_alerts',         rotulo: "Falta d'água",        descricao: 'Interrupções de abastecimento' },
  { chave: 'power_alerts',         rotulo: 'Falta de energia',    descricao: 'Interrupções de energia elétrica' },
  { chave: 'traffic_alerts',       rotulo: 'Trânsito e vias',     descricao: 'Interdições, trânsito e transporte' },
  { chave: 'works_alerts',         rotulo: 'Obras',               descricao: 'Obras e intervenções na região' },
  { chave: 'events_alerts',        rotulo: 'Eventos',             descricao: 'Feiras, shows e atividades' },
  { chave: 'public_notice_alerts', rotulo: 'Comunicados',         descricao: 'Avisos oficiais da prefeitura' },
];

/** Preferências todas ligadas — o padrão de quem acabou de acompanhar. */
export const PREFERENCIAS_PADRAO = Object.fromEntries(PREFERENCIAS.map((p) => [p.chave, true]));

/** Os tipos que um interruptor silencia. */
export const tiposDaPreferencia = (chave) => TIPOS.filter((t) => t.pref === chave);

// ── Filtros da tela ───────────────────────────────────────────────────────────

/** Os filtros do topo do Agora, na ordem do layout. */
export const FILTROS = [
  { id: 'todos',    rotulo: 'Todos' },
  { id: 'alertas',  rotulo: 'Alertas' },
  { id: 'eventos',  rotulo: 'Eventos' },
  { id: 'transito', rotulo: 'Trânsito' },
  { id: 'servicos', rotulo: 'Serviços' },
];

/** Os ids de tipo de um filtro. `null` para "todos" — que vira "sem filtro" na
 *  consulta, e não uma lista com os onze. */
export const tiposDoFiltro = (filtro) => {
  if (!filtro || filtro === 'todos') return null;
  return TIPOS.filter((t) => t.grupo === filtro).map((t) => t.id);
};

// ── Estados ───────────────────────────────────────────────────────────────────

/**
 * Os estados, e como cada um se apresenta.
 *
 * `aberto` é o que separa "ainda está acontecendo" de "acabou". Três telas
 * precisam da distinção e nenhuma deve refazer a lista de status à mão — foi
 * assim que `is_active` virou o problema que a seção 17 do plano manda evitar.
 */
export const STATUS = {
  draft:                 { rotulo: 'Rascunho',      curto: 'RASCUNHO',   tom: 'neutro',  aberto: false },
  scheduled:             { rotulo: 'Programado',    curto: 'PROGRAMADO', tom: 'info',    aberto: true  },
  active:                { rotulo: 'Em andamento',  curto: 'EM ANDAMENTO', tom: 'alerta', aberto: true },
  awaiting_confirmation: { rotulo: 'Aguardando confirmação', curto: 'VERIFICAR', tom: 'atencao', aberto: true },
  resolved:              { rotulo: 'Normalizado',   curto: 'NORMALIZADO', tom: 'ok',     aberto: false },
  cancelled:             { rotulo: 'Cancelado',     curto: 'CANCELADO',  tom: 'neutro',  aberto: false },
};

export const statusDe = (id) => STATUS[id] || STATUS.active;

export const estaAberto = (evento) => Boolean(statusDe(evento?.status).aberto);

// ── Datas ─────────────────────────────────────────────────────────────────────

const paraData = (valor) => {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
};

const doisDigitos = (n) => String(n).padStart(2, '0');

/** "14:20" */
export const horaCurta = (valor) => {
  const d = paraData(valor);
  if (!d) return '';
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
};

/** Quantos dias inteiros separam duas datas no calendário local. */
const diasDeDiferenca = (a, b) => {
  const dia = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((dia(a) - dia(b)) / 86400000);
};

/**
 * A previsão em texto curto: "Hoje, 18h", "Amanhã, 08h", "30/08 às 18h".
 *
 * POR QUE "HOJE" E NÃO A DATA
 *
 * A previsão só é útil se responder "falta quanto". Uma pessoa lendo
 * "30/08/2026 18:00" às 15h precisa conferir que dia é hoje para entender que
 * faltam três horas — e é exatamente essa conta que o aviso existe para poupar.
 *
 * A hora redonda vira "18h" porque é como se fala; 18:30 continua "18:30".
 */
/**
 * A hora como se fala.
 *
 * "0h" É ERRADO, E ERA O QUE SAÍA
 *
 * `getHours()` devolve 0 à meia-noite, e "Amanhã, 0h" não é português — parece
 * campo não preenchido. Meia-noite e meio-dia têm nome, e é assim que a pessoa
 * que leu o aviso vai repetir para o vizinho.
 */
const horaFalada = (d) => {
  const h = d.getHours();
  const m = d.getMinutes();
  if (m === 0 && h === 0) return 'meia-noite';
  if (m === 0 && h === 12) return 'meio-dia';
  return m === 0 ? `${h}h` : `${doisDigitos(h)}:${doisDigitos(m)}`;
};

/**
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.soDia=false] previsão dada só em dia — omite a hora.
 *
 * POR QUE `soDia` EXISTE
 *
 * "Amanhã, meia-noite" é falsa precisão: ninguém prometeu meia-noite — o campo
 * de hora ficou vazio e virou 00:00. Quem publica um alerta muitas vezes sabe o
 * dia e não a hora, e "deve normalizar amanhã" é uma previsão legítima.
 *
 * Sem esta opção, a saída eram duas mentiras à escolha: uma hora inventada, ou
 * um alerta sem previsão nenhuma. Com ela, a tela diz exatamente o que foi dito.
 */
export const previsaoLegivel = (valor, agora = new Date(), { soDia = false } = {}) => {
  const d = paraData(valor);
  if (!d) return '';

  const dias = diasDeDiferenca(d, paraData(agora) || new Date());

  if (soDia) {
    if (dias === 0) return 'Hoje';
    if (dias === 1) return 'Amanhã';
    if (dias === -1) return 'Ontem';
    return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}`;
  }

  const hora = horaFalada(d);
  if (dias === 0) return `Hoje, ${hora}`;
  if (dias === 1) return `Amanhã, ${hora}`;
  if (dias === -1) return `Ontem, ${hora}`;
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)} às ${hora}`;
};

/**
 * O fim do dia escolhido, no relógio de quem está publicando.
 *
 * É o instante que uma previsão "só o dia" grava — e não 00:00. A varredura da
 * 206 marca como vencida toda previsão que passou; gravada à meia-noite, uma
 * previsão para amanhã venceria no primeiro segundo de amanhã e acordaria o
 * responsável às 00:00:01 para confirmar algo que ele disse que levaria o dia.
 *
 * @param {string} data no formato do <input type="date">: AAAA-MM-DD
 */
export const fimDoDiaLocal = (data) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) return null;
  const [ano, mes, dia] = data.split('-').map(Number);
  const d = new Date(ano, mes - 1, dia, 23, 59, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * As três precisões que uma previsão pode ter.
 *
 * POR QUE TRÊS ESTADOS EXPLÍCITOS, E NÃO CAIXAS DE MARCAR
 *
 * "Sem previsão" e "só o dia" não são modificadores de uma data — são respostas
 * diferentes à mesma pergunta, e uma exclui a outra. Como duas caixas
 * independentes, existiriam combinações sem sentido ("sem previsão, só o dia") e
 * um estado implícito (nenhuma marcada = data e hora) que ninguém escolheu.
 *
 * "Sem previsão" precisa ser tão fácil de escolher quanto as outras duas. É a
 * resposta honesta com mais frequência do que qualquer gestor gostaria — e um
 * formulário que a esconde produz o que ele estava tentando evitar: uma hora
 * inventada.
 */
export const PRECISAO_PREVISAO = [
  { id: 'hora',    rotulo: 'Data e hora' },
  { id: 'dia',     rotulo: 'Só o dia' },
  { id: 'nenhuma', rotulo: 'Sem previsão' },
];

/**
 * O instante a gravar, a partir do que a tela coletou.
 *
 * Devolve `null` para "sem previsão" e para data vazia — os dois significam a
 * mesma coisa no banco (`estimated_end_at is null`), e é a bandeira `soDia` que
 * diferencia "amanhã" de "amanhã às 18h".
 *
 * @returns {{instante: string|null, soDia: boolean}}
 */
export const instanteDaPrevisao = ({ precisao = 'hora', data, hora } = {}) => {
  if (precisao === 'nenhuma' || !data) return { instante: null, soDia: false };
  if (precisao === 'dia') return { instante: fimDoDiaLocal(data), soDia: true };

  const d = new Date(`${data}T${hora || '00:00'}`);
  return { instante: Number.isNaN(d.getTime()) ? null : d.toISOString(), soDia: false };
};

/** A precisão de um acontecimento já gravado, para o formulário abrir no
 *  estado certo. */
export const precisaoDoEvento = (evento) => {
  if (!evento?.estimated_end_at) return 'nenhuma';
  return evento.estimated_end_day_only ? 'dia' : 'hora';
};


/** "há 32 min", "há 2h", "há 3 dias". Para a lista de resolvidos. */
export const tempoDesde = (valor, agora = new Date()) => {
  const d = paraData(valor);
  if (!d) return '';
  const minutos = Math.floor(((paraData(agora) || new Date()) - d) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
};

/**
 * O estado da previsão de um acontecimento.
 *
 * `vencida` é a pergunta da seção 12 do plano, e é ela que faz a tela dizer
 * "verificar" em vez de repetir "previsão: 18h" às 22h. A varredura do banco
 * responde a mesma pergunta — mas ela roda a cada 5 minutos, e a tela não pode
 * mentir nos 5 minutos entre uma passagem e outra.
 */
export const estadoDaPrevisao = (evento, agora = new Date()) => {
  const previsto = paraData(evento?.estimated_end_at);
  const referencia = paraData(agora) || new Date();

  if (!previsto) return { tem: false, vencida: false, texto: 'Sem previsão' };

  const vencida = estaAberto(evento) && previsto <= referencia;
  const soDia = Boolean(evento?.estimated_end_day_only);
  return {
    tem: true,
    vencida,
    soDia,
    quando: previsto,
    texto: previsaoLegivel(previsto, referencia, { soDia }),
  };
};

/**
 * Quanto da janela prevista já passou, de 0 a 1.
 *
 * POR QUE UMA BARRA, E NÃO SÓ A HORA
 *
 * "Previsão: hoje, 18h" às 14h e às 17h50 são a mesma frase e situações
 * opostas. A barra é a única parte da tela que responde "falta muito?" sem a
 * pessoa fazer a conta — e é o que transforma o aviso em algo que vale reabrir
 * durante o dia.
 *
 * `null` quando não há previsão ou não há janela (previsão antes do início):
 * uma barra sem denominador desenharia uma proporção inventada.
 *
 * Passa de 1 quando a previsão vence, e quem desenha decide o que fazer com
 * isso — a tela corta em 100% e troca a cor. Devolver o valor cru é o que
 * permite dizer "venceu há muito" sem uma segunda conta.
 */
export const progressoDaPrevisao = (evento, agora = new Date()) => {
  const inicio = paraData(evento?.started_at);
  const fim = paraData(evento?.estimated_end_at);
  if (!inicio || !fim) return null;

  const janela = fim - inicio;
  if (janela <= 0) return null;

  const decorrido = (paraData(agora) || new Date()) - inicio;
  return Math.max(0, decorrido / janela);
};

/**
 * A última coisa que aconteceu, para a legenda do cartão de previsão.
 *
 * O mockup escreve "Atualizado às 15:42" — e essa é a informação certa quando
 * houve atualização. Sem nenhuma, "Iniciado às 14:20" é o que existe: repetir
 * "atualizado" para um evento que ninguém tocou seria dizer que houve trabalho
 * onde não houve.
 */
export const legendaDoAndamento = (evento) => {
  const updates = Array.isArray(evento?.updates) ? evento.updates : [];
  const depoisDoInicio = updates
    .filter((u) => u.type !== 'created' && u.created_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (depoisDoInicio.length > 0) {
    return { rotulo: 'Atualizado', hora: horaCurta(depoisDoInicio[0].created_at) };
  }
  if (evento?.started_at) {
    return { rotulo: 'Iniciado', hora: horaCurta(evento.started_at) };
  }
  return null;
};

// ── Áreas ─────────────────────────────────────────────────────────────────────

const juntarComE = (nomes) => {
  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
};

const PLURAL_AREA = {
  neighborhood: ['bairro', 'bairros'],
  street: ['rua', 'ruas'],
  city: ['cidade', 'cidades'],
};

/**
 * "Morada Nobre e mais 2 bairros" / "Morada Nobre, Centro e Boa Vista + 2 bairros".
 *
 * `maximo` é a densidade: o cartão da lista mostra 1 nome, a tela de detalhe
 * mostra 3. A contagem do resto usa o plural do tipo que SOBROU, não do
 * primeiro — "Centro e mais 2 ruas" quando o que sobrou foram ruas.
 *
 * Um evento de cidade inteira não lista nada: dizer "Floresta e mais 14
 * bairros" seria descrever de duas formas a mesma coisa.
 */
export const rotuloDasAreas = (areas, { maximo = 1 } = {}) => {
  const lista = Array.isArray(areas) ? areas.filter((a) => a && a.label) : [];
  if (lista.length === 0) return '';

  const cidade = lista.find((a) => a.area_type === 'city');
  if (cidade) return `Toda a cidade · ${cidade.label}`;

  const mostrados = lista.slice(0, Math.max(1, maximo));
  const restantes = lista.slice(mostrados.length);
  const nomes = juntarComE(mostrados.map((a) => a.label));

  if (restantes.length === 0) return nomes;

  const tipoRestante = restantes.every((a) => a.area_type === restantes[0].area_type)
    ? restantes[0].area_type
    : 'neighborhood';
  const [singular, plural] = PLURAL_AREA[tipoRestante] || PLURAL_AREA.neighborhood;

  return `${nomes} e mais ${restantes.length} ${restantes.length === 1 ? singular : plural}`;
};

/** Só os nomes, para a aba "Áreas afetadas". */
export const nomesDasAreas = (areas) =>
  (Array.isArray(areas) ? areas : []).filter((a) => a && a.label).map((a) => a.label);

// ── Linha do tempo ────────────────────────────────────────────────────────────

const LEGENDA_UPDATE = {
  created:              { titulo: 'Início da ocorrência',    tom: 'inicio' },
  progress:             { titulo: 'Serviço em andamento',    tom: 'andamento' },
  extended:             { titulo: 'Previsão atualizada',     tom: 'andamento' },
  resolved:             { titulo: 'Normalização anunciada',  tom: 'ok' },
  reopened:             { titulo: 'Acontecimento reaberto',  tom: 'alerta' },
  cancelled:            { titulo: 'Aviso cancelado',         tom: 'neutro' },
  community_divergence: { titulo: 'A comunidade discorda',   tom: 'alerta' },
};

/**
 * A linha do tempo pronta para desenhar.
 *
 * O ÚLTIMO ITEM PODE NÃO EXISTIR NO BANCO
 *
 * Enquanto o acontecimento está aberto, a lista termina com uma parada vazia —
 * "Aguardando confirmação". Ela não é uma linha de `city_event_updates`, e não
 * deve ser: gravá-la faria a tabela guardar uma coisa que ainda não aconteceu,
 * e a regra 10 ("o histórico nunca é apagado") obrigaria a apagá-la depois.
 *
 * Ela é o que transforma a linha do tempo em promessa em vez de arquivo: quem
 * lê vê que falta um passo e que alguém vai ter que dá-lo.
 */
export const linhaDoTempo = (evento, agora = new Date()) => {
  const updates = Array.isArray(evento?.updates) ? [...evento.updates] : [];
  updates.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const itens = updates.map((u) => {
    const legenda = LEGENDA_UPDATE[u.type] || { titulo: 'Atualização', tom: 'andamento' };
    const nova = paraData(u.new_estimated_end_at);

    let titulo = u.message || legenda.titulo;
    let detalhe = u.message ? legenda.titulo : '';

    // A prorrogação é o único tipo em que o dado vale mais que o texto livre:
    // "atualizada para 18h" é o que a pessoa veio conferir.
    if (u.type === 'extended') {
      titulo = 'Previsão de normalização';
      // Mostra a previsão nova com a MESMA precisão com que foi dada: uma
      // prorrogação "só o dia" que aparecesse como "amanhã, 23:59" inventaria
      // um horário que ninguém prometeu.
      //
      // Sem data nenhuma, a prorrogação foi "ainda não, e não sei quando" — e
      // isso É informação. Cair no rótulo genérico ("Previsão atualizada")
      // esconderia a única coisa que a linha tem a dizer.
      detalhe = nova
        ? `Atualizada para ${previsaoLegivel(nova, agora, { soDia: Boolean(evento?.estimated_end_day_only) })}`
        : 'Sem previsão de normalização';
    }

    return {
      id: `u${u.id}`,
      hora: horaCurta(u.created_at),
      quando: u.created_at,
      titulo,
      detalhe,
      tom: legenda.tom,
      pendente: false,
    };
  });

  if (estaAberto(evento)) {
    const previsao = estadoDaPrevisao(evento, agora);
    itens.push({
      id: 'pendente',
      hora: '—',
      quando: null,
      titulo: 'Aguardando confirmação',
      detalhe: previsao.vencida ? 'A previsão terminou' : 'Verificação após previsão',
      tom: 'pendente',
      pendente: true,
    });
  }

  return itens;
};

// ── Confirmação da comunidade ─────────────────────────────────────────────────

/** O piso de respostas antes de a divergência valer alguma coisa. Igual ao da
 *  206 — as duas contas precisam dar o mesmo resultado, senão a tela promete
 *  uma reabertura que o banco não vai pedir. */
export const MINIMO_PARA_DIVERGIR = 10;

/**
 * O placar da enquete "já voltou?".
 *
 * `divergente` é a regra da seção 16: mais "ainda não" que "sim", com respostas
 * suficientes para a maioria significar alguma coisa. Abaixo do piso o placar
 * ainda aparece — quem respondeu tem direito de ver — mas não é chamado de
 * divergência, e ninguém é acordado por causa dele.
 */
export const resumoDasConfirmacoes = (confirmacoes) => {
  const sim = Math.max(0, Number(confirmacoes?.resolved) || 0);
  const nao = Math.max(0, Number(confirmacoes?.not_resolved) || 0);
  const total = sim + nao;

  const pctSim = total ? Math.round((100 * sim) / total) : 0;

  return {
    sim,
    nao,
    total,
    pctSim,
    pctNao: total ? 100 - pctSim : 0,
    confirmado: total >= MINIMO_PARA_DIVERGIR && sim > nao,
    divergente: total >= MINIMO_PARA_DIVERGIR && nao > sim,
    ultima: confirmacoes?.last_at || null,
  };
};

/** A frase do selo da comunidade, ou `null` quando ainda não dá para afirmar. */
export const veredictoDaComunidade = (resumo) => {
  if (!resumo || resumo.total === 0) return null;
  if (resumo.confirmado) {
    return { tom: 'ok', texto: `Normalização confirmada pela comunidade — ${resumo.pctSim}% das respostas indicam situação normal.` };
  }
  if (resumo.divergente) {
    return { tom: 'alerta', texto: `${resumo.pctNao}% de ${resumo.total} respostas dizem que ainda não normalizou.` };
  }
  return { tom: 'neutro', texto: `${resumo.total} ${resumo.total === 1 ? 'resposta' : 'respostas'} até agora.` };
};

/** A enquete só abre depois que o gestor anunciou a resolução (seção 15). */
export const podeConfirmar = (evento) => evento?.status === 'resolved';

// ── Minha Rua ─────────────────────────────────────────────────────────────────

/**
 * O cabeçalho de situação da rua: verde quando não há nada, o acontecimento
 * mais grave quando há.
 *
 * A ORDEM DE GRAVIDADE NÃO É A ORDEM DE CHEGADA
 *
 * Uma rua pode estar dentro de dois acontecimentos ao mesmo tempo — uma feira e
 * uma falta d'água. Mostrar o mais recente faria a feira esconder a falta
 * d'água; mostrar o mais grave é o que responde "o que eu preciso saber agora".
 */
const PESO_SEVERIDADE = { critical: 3, warning: 2, info: 1 };

export const situacaoDaRua = (eventos, agora = new Date()) => {
  const abertos = (Array.isArray(eventos) ? eventos : []).filter(estaAberto);

  if (abertos.length === 0) {
    return { normal: true, texto: 'Tudo normal na sua região', evento: null, outros: 0 };
  }

  const ordenados = [...abertos].sort((a, b) => {
    const peso = (PESO_SEVERIDADE[b.severity] || 0) - (PESO_SEVERIDADE[a.severity] || 0);
    if (peso !== 0) return peso;
    return new Date(b.started_at) - new Date(a.started_at);
  });

  const principal = ordenados[0];
  return {
    normal: false,
    texto: `${tipoDe(principal.type).rotulo} na sua região`,
    evento: principal,
    previsao: estadoDaPrevisao(principal, agora),
    outros: ordenados.length - 1,
  };
};
