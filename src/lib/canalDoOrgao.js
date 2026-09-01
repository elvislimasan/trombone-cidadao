// O canal de e-mail da secretaria: as regras que a tela e o e-mail compartilham.
//
// POR QUE ISTO É UM MÓDULO E NÃO CÓDIGO DENTRO DA PÁGINA
//
// Três consumidores diferentes precisam concordar sobre as mesmas frases: a
// tela de cadastro (`ManageAgencyChannelsPage`), a página pública que a
// secretaria abre (`OrgaoRelatorioPage`) e o bloco de cobranças dentro da
// bronca. Quando "entregue" virar outra palavra, ela muda num lugar só.
//
// O QUE ESTE MÓDULO **NÃO** FAZ
//
// Não decide quais broncas vão no relatório. Essa regra mora em
// `relatorio_do_orgao` (migração 222), no banco, ao lado das outras regras de
// "o que é uma bronca pendente" — a 199, a 207. Uma segunda redação dela aqui
// divergiria da primeira no dia em que o quórum mudasse.

/**
 * Os estados de um envio, na ordem em que acontecem.
 *
 * `gravaEtapa` é a coluna que importa, e só um estado a tem. Ela existe como
 * dado — e não como frase dentro de `detalhe` — porque é a invariante que o
 * teste guarda: no dia em que alguém quiser marcar "encaminhada" já no aceite
 * do provedor, o campo precisa mudar de forma visível, e não por reescrita de
 * um texto de tela.
 */
export const ESTADOS_DO_ENVIO = [
  {
    id: 'pendente',
    rotulo: 'Na fila',
    detalhe: 'Montado, ainda não saiu.',
    tom: 'neutro',
    gravaEtapa: false,
  },
  {
    id: 'enfileirado',
    rotulo: 'Enviando',
    detalhe: 'A função de envio foi chamada e ainda não respondeu.',
    tom: 'neutro',
    gravaEtapa: false,
  },
  {
    id: 'enviado',
    rotulo: 'Aceito pelo provedor',
    detalhe: 'Saiu daqui. Ainda não há confirmação de entrega — nenhuma etapa foi gravada.',
    tom: 'atencao',
    gravaEtapa: false,
  },
  {
    id: 'entregue',
    rotulo: 'Entregue',
    detalhe: 'O provedor confirmou a entrega. As broncas foram marcadas como encaminhadas.',
    tom: 'ok',
    gravaEtapa: true,
  },
  {
    id: 'falhou',
    rotulo: 'Falhou',
    detalhe: 'Não chegou. Nenhuma bronca foi marcada como encaminhada.',
    tom: 'erro',
    gravaEtapa: false,
  },
  {
    id: 'recusado',
    rotulo: 'Recusado',
    detalhe: 'O destinatário recusou o recebimento.',
    tom: 'erro',
    gravaEtapa: false,
  },
];

export const estadoDoEnvio = (id) =>
  ESTADOS_DO_ENVIO.find((e) => e.id === id) || {
    // O id desconhecido é preservado para a tela ter chave estável; o que não
    // se preserva é a autoridade. Um sexto status vindo do banco chega aqui
    // como "não gravou etapa" — errar para o lado de afirmar menos.
    id: id || 'desconhecido',
    rotulo: 'Desconhecido',
    detalhe: '',
    tom: 'neutro',
    gravaEtapa: false,
  };

/**
 * Um endereço plausível.
 *
 * Espelha o CHECK `orgao_canais_email_plausivel` da 222 — de propósito, e com
 * a mesma frouxidão. Validar e-mail com precisão é impossível e tentar produz
 * o pior resultado possível: recusar o endereço real de uma prefeitura porque
 * a regex não previu o formato. O que se quer barrar aqui é digitação sem
 * arroba, e a prova de que o endereço funciona é o bounce, não o formulário.
 */
export const emailPlausivel = (v) =>
  /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(v ?? '').trim());

/** A lista de cópia como o formulário a recebe: texto separado por vírgula ou linha. */
export const listaDeEmails = (texto) =>
  String(texto ?? '')
    .split(/[,;\n]/)
    .map((e) => e.trim())
    .filter(Boolean);

/**
 * O que impede este canal de ser salvo.
 *
 * Devolve lista, não booleano: um formulário que diz só "inválido" obriga a
 * pessoa a descobrir qual campo, e o cadastro de secretaria tem seis.
 */
export const problemasDoCanal = ({ nome, email, replyTo, copias = [], categorias = [] } = {}) => {
  const erros = [];
  if (String(nome ?? '').trim().length <= 2) {
    erros.push('O nome do órgão precisa ter ao menos 3 letras.');
  }
  if (!emailPlausivel(email)) {
    erros.push('O e-mail do órgão não parece um endereço válido.');
  }
  if (!emailPlausivel(replyTo)) {
    erros.push('Informe um e-mail de resposta — é para lá que a secretaria vai responder.');
  }
  const copiaRuim = copias.find((c) => !emailPlausivel(c));
  if (copiaRuim) {
    erros.push(`"${copiaRuim}" não parece um endereço válido.`);
  }
  if (categorias.length === 0) {
    erros.push('Escolha ao menos uma categoria sob responsabilidade deste órgão.');
  }
  return erros;
};

/**
 * As categorias já tomadas por OUTRO canal da mesma cidade.
 *
 * Espelha o índice único `orgao_categorias_um_responsavel_por_categoria` da
 * 222. Existe para a tela desabilitar a opção em vez de deixar o banco recusar
 * o salvamento inteiro — o mesmo motivo de `ReportOfficialStep` repetir o CHECK
 * da recusa.
 */
export const categoriasOcupadas = (canais = [], canalAtualId = null) => {
  const mapa = new Map();
  for (const canal of canais) {
    if (!canal || canal.id === canalAtualId) continue;
    for (const c of canal.categorias || []) {
      if (!mapa.has(c)) mapa.set(c, canal.nome);
    }
  }
  return mapa;
};

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const doisDigitos = (n) => String(n).padStart(2, '0');

/**
 * O período por extenso.
 *
 * `referencia` chega como `'2026-08-01'` — data sem fuso. Passar por `new
 * Date(texto)` a interpreta como meia-noite UTC e, no horário do Brasil, ela
 * vira 31/07: o mês errado no título do relatório. Por isso o parse é manual.
 */
export const periodoPorExtenso = (periodo, referencia) => {
  const partes = String(referencia ?? '').split('-').map(Number);
  if (partes.length !== 3 || partes.some((n) => !Number.isFinite(n))) return '';
  const [ano, mes, dia] = partes;

  if (periodo === 'mensal') return `${MESES[mes - 1]} de ${ano}`;

  const fim = new Date(Date.UTC(ano, mes - 1, dia + 6));
  return `${doisDigitos(dia)}/${doisDigitos(mes)} a ${doisDigitos(fim.getUTCDate())}/${doisDigitos(
    fim.getUTCMonth() + 1
  )}/${fim.getUTCFullYear()}`;
};

/**
 * A frase de cobrança que aparece dentro da bronca.
 *
 * Só conta envio ENTREGUE. "Cobrada 4 vezes" apoiada em e-mails que voltaram
 * seria a mesma falha que a barra de progresso antiga: número com aparência de
 * fato. E devolve `null` quando não há nada — a tela some inteira em vez de
 * mostrar "cobrada 0 vezes", que não é informação sobre a prefeitura, é
 * informação sobre o app.
 */
export const fraseDeCobranca = (cobrancas) => {
  const total = Number(cobrancas?.total ?? 0);
  if (!total) return null;

  const orgao = String(cobrancas?.orgao ?? '').trim() || 'o órgão responsável';
  const primeira = cobrancas?.primeira ? new Date(cobrancas.primeira) : null;
  const desde =
    primeira && !Number.isNaN(primeira.getTime())
      ? ` desde ${doisDigitos(primeira.getDate())}/${doisDigitos(primeira.getMonth() + 1)}/${primeira.getFullYear()}`
      : '';

  const vezes = total === 1 ? 'uma vez' : `${total} vezes`;
  const confirmadas = Number(cobrancas?.confirmadas ?? 0);

  return {
    titulo: `Enviada a ${orgao} ${vezes}${desde}`,
    detalhe:
      confirmadas > 0
        ? `${confirmadas === total ? 'Todos os envios foram confirmados' : `${confirmadas} de ${total} envios foram confirmados`} pelo órgão.`
        : 'O órgão ainda não confirmou o recebimento pelo link do relatório.',
  };
};
