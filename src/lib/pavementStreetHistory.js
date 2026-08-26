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
    }];
  });

/**
 * A imagem de fundo do topo da página.
 *
 * Não há campo de capa, e criar um custaria uma migração para repetir uma foto
 * que a rua já tem. A primeira foto DA RUA serve: é a que retrata o lugar. A do
 * homenageado não entra — um retrato desfocado atrás do nome da via leria como
 * homenagem póstuma, que não é o que a página diz.
 */
export const capaDaRua = (fotos) =>
  (fotos || []).find((foto) => foto.subject === 'street') || null;
