// Campos que cada categoria de bronca exige, e como eles viram colunas.
//
// POR QUE ISTO EXISTE
//
// A regra morava dentro do ReportModal, espalhada por três lugares: o
// `validateStep`, o JSX dos campos condicionais e a normalização no
// `useCreateReport`. Enquanto só aquele formulário criava bronca, funcionava.
//
// O modo patrulha passou a criar bronca também — e nasceu sem nenhuma dessas
// regras. Uma bronca de iluminação era gravada sem tipo de problema e sem
// plaqueta, que é justamente a informação que faz a prefeitura conseguir achar
// o poste. Cadastro assim não é "quase completo": é incompleto, e ocupa o lugar
// de um completo.
//
// Aqui a regra é dado, não código espalhado: quem renderiza pergunta quais
// campos existem, quem valida pergunta o que falta, e quem grava pergunta como
// virar coluna. Acrescentar campo a uma categoria passa a ser mexer neste
// arquivo, não em duas telas.

/** Tipos de problema de iluminação. Espelha o select do ReportModal. */
export const TIPOS_DE_PROBLEMA_ILUMINACAO = [
  { value: 'lamp_off', label: 'lâmpada apagada' },
  { value: 'lamp_blinking', label: 'piscando' },
  { value: 'lamp_on_daytime', label: 'acesa durante o dia' },
  { value: 'no_lighting', label: 'poste sem iluminação' },
  { value: 'arm_damaged', label: 'braço/luminária danificado' },
  { value: 'exposed_wiring', label: 'fiação exposta' },
  { value: 'pole_leaning', label: 'poste inclinado' },
  { value: 'pole_broken', label: 'poste quebrado' },
  { value: 'no_identifier', label: 'sem identificação' },
  { value: 'other', label: 'outro' },
];

/**
 * Descrição dos campos extras por categoria.
 *
 * `tipo` diz ao formulário o que desenhar; `obrigatorio` diz ao validador o que
 * cobrar. Um campo pode ser da categoria sem ser obrigatório — é o caso da
 * marcação de obra da companhia de água, que é informação útil e não requisito.
 */
export const CAMPOS_POR_CATEGORIA = {
  iluminacao: [
    {
      id: 'issue_type',
      tipo: 'selecao',
      rotulo: 'Tipo do problema',
      obrigatorio: true,
      opcoes: TIPOS_DE_PROBLEMA_ILUMINACAO,
      erro: 'Selecione o tipo do problema.',
    },
    {
      id: 'pole_number',
      tipo: 'texto',
      rotulo: 'Número da plaqueta do poste',
      // É o que permite localizar o poste em campo. Sem isso a bronca vira
      // "tem um poste apagado nessa rua", que a concessionária não consegue
      // atender sem mandar alguém procurar.
      obrigatorio: true,
      exemplo: 'Ex.: 74666496 ou A1234',
      ajuda: 'Faixa amarela presa ao poste. Pode ter letras e números.',
      erro: 'Informe o número da plaqueta do poste.',
    },
  ],
  buracos: [
    {
      id: 'is_from_water_utility',
      tipo: 'confirmacao',
      rotulo: 'Buraco aberto por obra de água ou esgoto',
      obrigatorio: false,
      ajuda:
        'Marque se o buraco foi aberto por obras da companhia de abastecimento.',
    },
  ],
};

/** Campos extras da categoria. Lista vazia quando não há. */
export const camposDaCategoria = (categoryId) =>
  CAMPOS_POR_CATEGORIA[categoryId] || [];

/**
 * Limpa o número da plaqueta.
 *
 * As sugestões de poste chegam como "12 - 34567"; sem tirar o prefixo, o número
 * gravado não bate com o da plaqueta física. Mesma normalização do
 * useCreateReport, que é onde ela nasceu.
 */
export const normalizarPlaqueta = (bruto) =>
  String(bruto || '')
    .trim()
    .replace(/^\s*\d+\s*[-–—]\s*/u, '')
    .trim();

/**
 * O que falta preencher.
 *
 * @returns {Object<string,string>} erros por id de campo; vazio significa ok.
 */
export const validarCamposDaCategoria = (categoryId, dados = {}) => {
  const erros = {};
  for (const campo of camposDaCategoria(categoryId)) {
    if (!campo.obrigatorio) continue;
    const valor = dados[campo.id];
    const vazio =
      valor == null ||
      (typeof valor === 'string' && valor.trim() === '') ||
      (campo.tipo === 'confirmacao' && valor === false);
    if (vazio) erros[campo.id] = campo.erro || 'Campo obrigatório.';
  }
  return erros;
};

/** Atalho para bloquear o botão de enviar. */
export const categoriaCompleta = (categoryId, dados = {}) =>
  Object.keys(validarCamposDaCategoria(categoryId, dados)).length === 0;

/**
 * Converte os campos extras nas colunas de `reports`.
 *
 * Toda coluna aparece SEMPRE, com null quando não pertence à categoria. Omitir
 * a chave deixaria o valor anterior intacto num update, e uma bronca que trocou
 * de categoria carregaria a plaqueta da categoria antiga.
 */
export const camposParaColunas = (categoryId, dados = {}) => {
  const ehIluminacao = categoryId === 'iluminacao';
  const plaqueta = ehIluminacao ? normalizarPlaqueta(dados.pole_number) : '';

  return {
    issue_type: ehIluminacao ? dados.issue_type?.trim() || null : null,
    pole_number: ehIluminacao ? plaqueta || null : null,
    pole_id: ehIluminacao ? dados.pole_id || null : null,
    reported_pole_distance_m:
      ehIluminacao && dados.reported_pole_distance_m != null
        ? Number(dados.reported_pole_distance_m)
        : null,
    // As três colunas guardam a mesma plaqueta por caminhos diferentes de
    // cadastro. O ReportModal preenche assim, e divergir aqui faria a mesma
    // bronca aparecer com identificação em uma tela e sem em outra.
    reported_post_identifier: ehIluminacao
      ? dados.reported_post_identifier || plaqueta || null
      : null,
    reported_plate: ehIluminacao
      ? dados.reported_plate || plaqueta || null
      : null,
    is_from_water_utility:
      categoryId === 'buracos' ? !!dados.is_from_water_utility : null,
  };
};
