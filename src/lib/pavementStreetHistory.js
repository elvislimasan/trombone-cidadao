// A história da rua: o que a página pública precisa saber sobre os campos
// históricos antes de desenhá-los.
//
// POR QUE ISTO NÃO MORA NA PÁGINA
//
// `historical_photos` e `historical_documents` são colunas `jsonb` com uma
// única garantia no banco: que são arrays (ver a migração 197). Chave nenhuma é
// obrigatória, o formulário do admin preenche o que quer, e cadastros antigos
// não têm os campos que os novos têm. Ou seja: toda leitura é um caso de borda.
//
// Deixar isso na página significaria testar essas bordas montando JSX. Aqui são
// funções puras, e o teste é uma linha por caso.

export const hasPavementStreetHistory = (street) => Boolean(
  street?.honoree_name?.trim?.()
  || street?.biography?.trim?.()
  || street?.curiosities?.trim?.()
  || street?.historical_documents?.some?.((item) => item?.url?.trim?.())
  || street?.historical_photos?.some?.((item) => item?.url?.trim?.())
);

export const textoLimpo = (valor) => (typeof valor === 'string' ? valor.trim() : '');

/**
 * Data em dd/mm/aaaa.
 *
 * `new Date('2024-01-12')` é meia-noite UTC, que no Brasil ainda é dia 11 —
 * uma foto cadastrada como 12/01 apareceria como 11/01 na tela. Por isso a data
 * pura é fatiada como texto, sem passar por `Date`. Só o que vem com hora (um
 * `updated_at`, por exemplo) usa o construtor.
 */
export const formatarDataBr = (valor) => {
  const bruto = textoLimpo(valor);
  if (!bruto) return '';

  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruto);
  if (soData) {
    const [, ano, mes, dia] = soData;
    return `${dia}/${mes}/${ano}`;
  }

  const data = new Date(bruto);
  return Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-BR');
};

const UNIDADES = ['B', 'KB', 'MB', 'GB'];

/**
 * O tamanho pode chegar de duas formas, e as duas são legítimas: um número de
 * bytes (se algum dia o upload preencher sozinho) ou o texto que a pessoa
 * digitou no formulário ("245 KB"). Texto passa direto — reescrevê-lo só
 * quebraria o que já está certo.
 */
export const formatarTamanhoArquivo = (valor) => {
  if (typeof valor === 'string') return valor.trim();

  const bytes = Number(valor);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';

  let tamanho = bytes;
  let unidade = 0;
  while (tamanho >= 1024 && unidade < UNIDADES.length - 1) {
    tamanho /= 1024;
    unidade += 1;
  }

  const casas = unidade > 0 && tamanho < 10 ? 1 : 0;
  return `${tamanho.toFixed(casas).replace('.', ',')} ${UNIDADES[unidade]}`;
};

/**
 * A sigla do arquivo ("PDF"). Se o cadastro não declarou, sai da extensão do
 * endereço — e é preciso olhar só o CAMINHO: em `https://exemplo.com` o ponto
 * está no domínio, e uma leitura ingênua rotularia o documento como "COM".
 */
export const tipoDoArquivo = (documento) => {
  const declarado = textoLimpo(documento?.type);
  if (declarado) return declarado.toUpperCase();

  const url = textoLimpo(documento?.url);
  if (!url) return '';

  let caminho;
  try {
    caminho = new URL(url).pathname;
  } catch {
    caminho = url.split(/[?#]/)[0];
  }

  const arquivo = caminho.split('/').filter(Boolean).pop() || '';
  const extensao = /\.([a-z0-9]{2,5})$/i.exec(arquivo);
  return extensao ? extensao[1].toUpperCase() : '';
};

/** Fotos com endereço utilizável, já com os campos que a tela lê. */
export const normalizarFotos = (street) =>
  (Array.isArray(street?.historical_photos) ? street.historical_photos : []).flatMap((item) => {
    const url = textoLimpo(item?.url);
    if (!url) return [];
    return [{
      url,
      caption: textoLimpo(item?.caption),
      date: textoLimpo(item?.date),
      subject: textoLimpo(item?.subject) || 'street',
      // Chave nova em coluna `jsonb`: cadastro antigo não a tem, e a ausência
      // significa "não é destaque" — que é o comportamento de antes dela existir.
      featured: item?.featured === true,
    }];
  });

/** Documentos com endereço utilizável, com tipo e tamanho já resolvidos. */
export const normalizarDocumentos = (street) =>
  (Array.isArray(street?.historical_documents) ? street.historical_documents : []).flatMap((item) => {
    const url = textoLimpo(item?.url);
    if (!url) return [];
    return [{
      url,
      title: textoLimpo(item?.title),
      description: textoLimpo(item?.description),
      type: tipoDoArquivo(item),
      size: formatarTamanhoArquivo(item?.size),
      // `kind` diz O QUE o documento é; `type` diz o formato do arquivo. Os dois
      // nomes convivem porque `type` já significava "PDF" muito antes disto.
      //
      // Ausência vira "outro", nunca "lei" nem "projeto_lei": os filtros de
      // documentação existem para conferir o cadastro contra a prefeitura, e
      // documento que ninguém classificou ainda não é prova de nada.
      kind: ['lei', 'projeto_lei'].includes(item?.kind) ? item.kind : 'outro',
    }];
  });

/**
 * A rua tem a lei municipal anexada?
 *
 * Conta só o que alguém marcou como lei. Contar qualquer anexo faria uma rua
 * com um ofício qualquer aparecer como conferida contra a prefeitura, que é
 * exatamente a pergunta que o filtro existe para responder.
 */
export const temLeiMunicipal = (street) =>
  normalizarDocumentos(street).some((documento) => documento.kind === 'lei');

/**
 * A rua tem o projeto de lei anexado?
 *
 * Documento diferente da lei, e não um detalhe: a lei é o ato que denomina, o
 * projeto é a proposta que tramitou na Câmara. Na prática a maioria das ruas
 * tem a primeira e não a segunda — e é essa diferença que o relatório de
 * documentação incompleta existe para listar.
 */
export const temProjetoDeLei = (street) =>
  normalizarDocumentos(street).some((documento) => documento.kind === 'projeto_lei');

/**
 * O nome do homenageado repete o da rua?
 *
 * "Rua Maria Elianete dos Santos Lima" seguida de "Maria Elianete dos Santos
 * Lima" gasta duas linhas para dizer uma coisa só. Quando o título da página já
 * carrega o nome, o cartão do homenageado mostra a FOTO e a biografia — que é
 * o que ele tem de próprio.
 *
 * A comparação ignora acento e caixa porque o cadastro diverge: a placa da rua
 * diz "Damiao" e a biografia diz "Damião", e as duas são a mesma pessoa.
 */
export const nomeRedundante = (nomeDaRua, nomeDoHomenageado) => {
  const dobrar = (valor) => textoLimpo(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rua = dobrar(nomeDaRua);
  const homenageado = dobrar(nomeDoHomenageado);
  if (!rua || !homenageado) return false;
  return rua.includes(homenageado);
};

/**
 * As fotos DA RUA, na ordem de exibição: a destacada primeiro.
 *
 * O retrato do homenageado fica de fora. Ele tem lugar próprio na página — no
 * cartão "Quem dá nome à rua" — e entrar na galeria o faria aparecer duas
 * vezes, uma delas fora de contexto.
 */
export const fotosDaRuaOrdenadas = (fotos) => {
  const daRua = (fotos || []).filter((foto) => foto.subject === 'street');
  const destaque = daRua.find((foto) => foto.featured);
  return destaque ? [destaque, ...daRua.filter((foto) => foto !== destaque)] : daRua;
};

/**
 * A imagem de fundo do topo da página.
 *
 * A DESTACADA GANHA; SEM ELA, A PRIMEIRA DA RUA
 *
 * O segundo degrau é o comportamento que existia antes do destaque, e é o que
 * faz todo cadastro já feito continuar com exatamente a mesma capa — a coluna é
 * `jsonb` e ninguém precisa reabrir rua nenhuma.
 *
 * A do homenageado não entra em nenhum dos dois casos, nem marcada como
 * destaque: um retrato desfocado atrás do nome da via leria como homenagem
 * póstuma, que não é o que a página diz.
 */
export const capaDaRua = (fotos) => fotosDaRuaOrdenadas(fotos)[0] || null;
