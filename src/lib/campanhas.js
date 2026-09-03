// Campanhas sazonais editoriais.
//
// "EDITORIAL" É A PALAVRA QUE DECIDE TUDO
//
// Uma campanha não é gerada por regra, não roda sozinha e não aparece porque o
// calendário virou. Alguém decide que faz sentido falar de bueiro entupido
// antes da chuva, escreve o texto, escolhe o período e assina.
//
// Sem autor, "campanha sazonal" é notificação automática com tema — e o app já
// tem o suficiente de aviso que ninguém pediu. O `editor_id` obrigatório na
// migração 214 é essa decisão escrita como restrição.
//
// CAMPANHA NÃO PAGA NADA A MAIS
//
// Prêmio por volume está fora do roadmap (§36.14), e campanha com recompensa
// própria é prêmio por volume com tema — a pessoa registraria dez bueiros na
// semana da campanha e nenhum na seguinte, e o dado ficaria com um pico que não
// corresponde a nada da cidade.
//
// O que a campanha oferece é ATENÇÃO: ela diz o que é útil agora. O útil
// continua pagando o que sempre pagou.
//
// E ELA TEM FIM
//
// O CHECK de 92 dias na 214 existe porque campanha que não acaba é banner
// permanente, e banner permanente deixa de ser lido na segunda semana. Aqui a
// mesma regra aparece como `vigente`: passou do fim, some — sem ninguém
// precisar lembrar de despublicar.

const dia = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const soData = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * A campanha está no ar hoje?
 *
 * Compara só a data, sem hora: uma campanha que termina dia 30 vale o dia 30
 * inteiro. Comparar com hora a encerraria à meia-noite do dia 29 para quem
 * abrisse o app às 23h59 — e ninguém entende um prazo que acaba um dia antes do
 * que está escrito.
 */
export const vigente = (campanha, agora = new Date()) => {
  if (!campanha || campanha.status !== 'publicada') return false;

  const inicio = dia(campanha.inicio);
  const fim = dia(campanha.fim);
  if (!inicio || !fim) return false;

  const hoje = soData(agora);
  return hoje >= soData(inicio) && hoje <= soData(fim);
};

/**
 * Quantos dias faltam para acabar.
 *
 * Serve para a tela dizer "termina domingo" em vez de mostrar uma data. Não é
 * contagem regressiva com urgência fabricada: campanha não é promoção, e o
 * texto de quem consome isto deve dizer o prazo sem inventar pressa.
 */
export const diasRestantes = (campanha, agora = new Date()) => {
  const fim = dia(campanha?.fim);
  if (!fim) return null;
  return Math.max(0, Math.round((soData(fim) - soData(agora)) / 86400000));
};

/**
 * A campanha vigente de uma cidade.
 *
 * Uma só, e a que começou mais tarde. Duas campanhas simultâneas competem pela
 * mesma atenção e cancelam as duas — e escolher a mais recente é o
 * comportamento que o editor espera quando publica uma nova sem despublicar a
 * anterior.
 *
 * Campanha nacional (sem `city_id`) perde para a da cidade: quem escreveu sobre
 * o bairro sabe mais do que quem escreveu sobre o país.
 */
export const campanhaVigente = (campanhas = [], cityId = null, agora = new Date()) => {
  const candidatas = (Array.isArray(campanhas) ? campanhas : [])
    .filter((c) => vigente(c, agora))
    .filter((c) => c.city_id == null || String(c.city_id) === String(cityId));

  if (candidatas.length === 0) return null;

  return candidatas.sort((a, b) => {
    const daCidade = (c) => (c.city_id == null ? 0 : 1);
    const porEscopo = daCidade(b) - daCidade(a);
    if (porEscopo !== 0) return porEscopo;
    return (dia(b.inicio) ?? 0) - (dia(a.inicio) ?? 0);
  })[0];
};

/**
 * O que a campanha pede, pronto para a tela.
 *
 * `acao` aponta para o que já existe — a Rota do Dia quando há categoria de
 * campo, o cadastro quando o tema é de registro. Uma campanha não inventa fluxo
 * próprio: se precisasse de tela nova, seria funcionalidade com data de
 * validade, e é isso que uma campanha não deve ser.
 */
export const chamadaDaCampanha = (campanha, agora = new Date()) => {
  if (!campanha) return null;
  const dias = diasRestantes(campanha, agora);

  return {
    titulo: campanha.titulo,
    chamada: campanha.chamada || null,
    corpo: campanha.corpo || null,
    // Sem urgência fabricada: informa o prazo e para por aí.
    prazo:
      dias === 0
        ? 'Último dia'
        : dias === 1
        ? 'Termina amanhã'
        : dias != null
        ? `Termina em ${dias} dias`
        : null,
    acao: campanha.categoria_id
      ? {
          rotulo: 'Ver a rota de hoje',
          // A categoria viaja no link: sem ela a campanha dizia "iluminação",
          // mas a rota consultava qualquer bronca ao redor do usuário.
          para: `/rota-do-dia?categoria=${encodeURIComponent(campanha.categoria_id)}&campanha=${encodeURIComponent(campanha.id)}`,
        }
      : { rotulo: 'Ver o que fazer', para: '/missoes' },
    categoriaId: campanha.categoria_id || null,
    // A assinatura é parte do conteúdo, não rodapé: é o que diz ao leitor que
    // uma pessoa decidiu isto.
    assinatura: campanha.editor?.name || null,
  };
};

/**
 * Uma campanha pode ir ao ar?
 *
 * Espelha `campaigns_publicada_tem_autoria` e `campaigns_duracao_sazonal` da
 * 214, para o formulário não oferecer o que o banco vai recusar.
 */
export const DURACAO_MAXIMA_DIAS = 92;

export const podePublicarCampanha = (campanha) => {
  const faltas = [];

  if (!campanha?.titulo?.trim()) faltas.push('Título');
  if (!campanha?.chamada?.trim()) faltas.push('Chamada');
  if (!campanha?.editor_id) faltas.push('Quem assina');

  const inicio = dia(campanha?.inicio);
  const fim = dia(campanha?.fim);

  if (!inicio || !fim) {
    faltas.push('Período');
  } else if (fim < inicio) {
    faltas.push('Período (o fim vem antes do início)');
  } else if ((soData(fim) - soData(inicio)) / 86400000 > DURACAO_MAXIMA_DIAS) {
    faltas.push(`Período (no máximo ${DURACAO_MAXIMA_DIAS} dias — sazonal tem fim)`);
  }

  return { ok: faltas.length === 0, faltas };
};
