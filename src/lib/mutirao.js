// Mutirão presencial: os oito requisitos, como código.
//
// POR QUE ISTO É UMA LISTA VERIFICÁVEL E NÃO UM TEXTO DE AJUDA
//
// A §36.7 diz que uma Mega Patrulha "só entra com" oito coisas. Escrito como
// recomendação, esse tipo de lista sobrevive ao primeiro mutirão e desaparece no
// terceiro, quando alguém está com pressa. Escrito como condição de publicação,
// ele não depende de ninguém lembrar.
//
// E o custo de esquecer não é simétrico: um mutirão sem canal de suporte é um
// grupo de pessoas na rua sem para quem ligar. O produto está convocando gente
// para o espaço público — a barra tem que ser alta na direção da segurança.
//
// A ALTERNATIVA REMOTA NÃO É ACESSÓRIA
//
// É um dos oito, e é o que impede o mutirão de transformar participação cívica
// em algo que exige poder caminhar por duas horas. O princípio 17 já diz que
// campo e participação remota são formas complementares; aqui isso vira
// requisito de publicação.
//
// O RELATÓRIO PÚBLICO É EXIGIDO NO FIM, NÃO NO COMEÇO
//
// Os sete primeiros bloqueiam a publicação. O oitavo — relatório do resultado —
// bloqueia o ENCERRAMENTO. Exigi-lo antes seria impossível; não exigi-lo nunca
// repetiria o padrão que a fase 1 corrigiu: pedir trabalho e não devolver o que
// ele produziu.

/**
 * Os sete requisitos para publicar.
 *
 * `campo` é a coluna correspondente em `mutiroes` (migração 213). A lista é a
 * fonte única: a validação, o formulário e a mensagem de erro saem toda daqui,
 * e um requisito novo entra acrescentando uma linha.
 */
export const REQUISITOS = [
  {
    id: 'organizador',
    campo: 'organizador_id',
    rotulo: 'Organizador responsável',
    porque: 'Alguém responde pelo encontro, com nome e conta.',
  },
  {
    id: 'area_horario',
    campo: 'area_descricao',
    rotulo: 'Área e horário revisados',
    porque: 'A área foi olhada antes, não sorteada no dia.',
  },
  {
    id: 'encontro',
    campo: 'ponto_de_encontro',
    rotulo: 'Ponto de encontro e de encerramento',
    porque: 'Começar e terminar juntos é o que evita alguém ficar sozinho na rua.',
  },
  {
    id: 'orientacao',
    campo: 'orientacao',
    rotulo: 'Orientação de foto, privacidade e trânsito',
    porque:
      'Rosto, placa e documento não entram nas fotos; ninguém fotografa em cima da via.',
  },
  {
    id: 'suporte',
    campo: 'canal_suporte',
    rotulo: 'Canal de suporte durante o mutirão',
    porque: 'Um número ou grupo que responde enquanto as pessoas estão na rua.',
  },
  {
    id: 'objetivo',
    campo: 'objetivo_dados',
    rotulo: 'Objetivo de dados específico',
    porque:
      'O que este mutirão vai produzir. Sem isso, ele vira caminhada com aplicativo aberto.',
  },
  {
    id: 'remoto',
    campo: 'alternativa_remota',
    rotulo: 'Alternativa para quem não pode caminhar',
    porque:
      'Participação cívica não pode exigir pernas. Campo e remoto são complementares.',
  },
];

/** O oitavo, cobrado no encerramento. */
export const REQUISITO_RELATORIO = {
  id: 'relatorio',
  campo: 'relatorio_publico',
  rotulo: 'Relatório público do resultado',
  porque: 'O que foi produzido, e o que foi feito com isso.',
};

const preenchido = (v) => {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
};

/**
 * O que ainda falta para publicar.
 *
 * Devolve a lista, não um booleano: o organizador precisa ver O QUE falta, e um
 * "não pode publicar" sem itens é a forma mais rápida de ele desistir de
 * organizar.
 */
export const faltaParaPublicar = (mutirao) => {
  const faltando = REQUISITOS.filter((r) => !preenchido(mutirao?.[r.campo]));
  return {
    podePublicar: faltando.length === 0,
    faltando,
    rotulo: `${REQUISITOS.length - faltando.length} de ${REQUISITOS.length} requisitos`,
  };
};

/**
 * O horário está dentro da janela diurna?
 *
 * "Mutirão diurno" é a entrega da fase 3, e o motivo é o mesmo da Rota do Dia:
 * o app está mandando gente à rua. A janela é mais estreita que a da rota
 * porque um mutirão dura horas — começar às 16h já termina no escuro.
 */
export const HORA_INICIO_MIN = 6;
export const HORA_INICIO_MAX = 15;

export const horarioDiurno = (inicio) => {
  if (!inicio) return { ok: false, texto: 'Defina o horário de início.' };

  const d = inicio instanceof Date ? inicio : new Date(inicio);
  if (Number.isNaN(d.getTime())) return { ok: false, texto: 'Horário inválido.' };

  const hora = d.getHours();
  if (hora < HORA_INICIO_MIN || hora > HORA_INICIO_MAX) {
    return {
      ok: false,
      texto: `Mutirão é atividade diurna. Comece entre ${HORA_INICIO_MIN}h e ${HORA_INICIO_MAX}h — um encontro que dura horas e começa tarde termina no escuro.`,
    };
  }
  return { ok: true, texto: null };
};

/**
 * Pode publicar agora?
 *
 * Junta as duas checagens porque a tela faz uma pergunta só. Os motivos vêm
 * separados para o formulário poder apontar o campo certo.
 */
export const podePublicar = (mutirao) => {
  const requisitos = faltaParaPublicar(mutirao);
  const horario = horarioDiurno(mutirao?.inicio_em);

  return {
    ok: requisitos.podePublicar && horario.ok,
    faltando: requisitos.faltando,
    rotulo: requisitos.rotulo,
    horario,
  };
};

/**
 * Pode encerrar?
 *
 * Só com o relatório. Um mutirão que some da tela sem dizer o que produziu
 * ensina que o esforço não é contabilizado — e é o mesmo padrão que a fase 1
 * corrigiu nas broncas.
 */
export const podeEncerrar = (mutirao) => {
  const temRelatorio = preenchido(mutirao?.[REQUISITO_RELATORIO.campo]);
  return {
    ok: temRelatorio,
    texto: temRelatorio
      ? null
      : 'Escreva o relatório público antes de encerrar: o que foi produzido e o que será feito com isso.',
  };
};
