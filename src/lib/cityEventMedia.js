import { v4 as uuidv4 } from 'uuid';

// A foto do acontecimento.
//
// POR QUE UM ARQUIVO SÓ, E NÃO UMA CÓPIA DE `pavementStreetMedia.js`
//
// Aquele lida com dois tipos de anexo (foto e documento), sete extensões de
// escritório e uma galeria por rua. Aqui é uma imagem, opcional, por
// acontecimento. Reaproveitar aquele módulo obrigaria a passar `kind: 'photo'`
// e um `streetId` que não existe, e a herdar o bucket errado.
//
// O QUE ELE COMPARTILHA DE PROPÓSITO
//
// A forma: `{ path, url }` de volta, remoção por caminho, e o caminho começando
// pelo `city_id` — que é o que a policy do Storage lê para saber se quem
// enviou pode publicar naquela cidade (migração 209).

export const CITY_EVENT_BUCKET = 'city-events';

export const CITY_EVENT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

// O bucket recusa acima disto (5 MB na 209). Barrar aqui também é o que
// transforma "erro de rede genérico do Storage" numa frase que diz o que fazer.
const MAX_BYTES = 5 * 1024 * 1024;

const MIME_POR_EXTENSAO = {
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const PERMITIDOS = new Set(CITY_EVENT_IMAGE_ACCEPT.split(','));

const extensaoDe = (nome) => {
  const m = String(nome || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] || '';
};

/** O tipo do arquivo, com a extensão como plano B — a câmera nativa às vezes
 *  devolve `File` sem `type`. */
export const cityEventMimeType = (file) =>
  String(file?.type || '').trim().toLowerCase()
  || MIME_POR_EXTENSAO[extensaoDe(file?.name)]
  || 'application/octet-stream';

/** Mensagem de erro, ou string vazia quando o arquivo serve. */
export const validarImagemDeAcontecimento = (file) => {
  if (!file) return 'Selecione uma imagem.';
  if (!PERMITIDOS.has(cityEventMimeType(file))) return 'Use uma imagem JPG, PNG, WebP ou AVIF.';
  if (Number(file.size) > MAX_BYTES) return 'A imagem deve ter no máximo 5 MB.';
  return '';
};

const nomeSeguro = (nome) => {
  const limpo = String(nome || 'foto')
    .normalize('NFD')
    // Os combinantes vão por escape, e não literais: um editor que normalize o
    // arquivo para NFC apagaria a classe, e o acento voltaria para o caminho.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return limpo || 'foto';
};

/**
 * `<city_id>/<uuid>-<arquivo>`.
 *
 * O id do acontecimento NÃO entra: a foto é enviada antes de o acontecimento
 * existir. Um caminho que só pode ser montado depois obrigaria a publicar sem
 * foto e editar em seguida — e o alerta sairia sem a imagem justamente no
 * minuto em que mais gente o lê.
 */
export const caminhoDaImagem = ({ cityId, fileName }) => {
  if (!/^\d+$/.test(String(cityId || ''))) throw new Error('Cidade inválida para o envio da imagem.');
  return `${cityId}/${uuidv4()}-${nomeSeguro(fileName)}`;
};

/** Envia e devolve `{ path, url }`. */
export const uploadImagemDeAcontecimento = async ({ supabase, file, cityId }) => {
  const erro = validarImagemDeAcontecimento(file);
  if (erro) throw new Error(erro);

  const path = caminhoDaImagem({ cityId, fileName: file.name });
  const contentType = cityEventMimeType(file);

  const { error } = await supabase.storage
    .from(CITY_EVENT_BUCKET)
    .upload(path, file, { cacheControl: '3600', contentType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(CITY_EVENT_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    // Sem URL o objeto ficaria órfão no bucket: ninguém teria como referenciá-lo
    // nem apagá-lo depois.
    await supabase.storage.from(CITY_EVENT_BUCKET).remove([path]);
    throw new Error('Não foi possível gerar o endereço da imagem enviada.');
  }

  return { path, url: data.publicUrl };
};

/**
 * Remove objetos do bucket.
 *
 * Nunca lança: a remoção acontece DEPOIS de a gravação dar certo, e falhar aqui
 * significaria mostrar um erro para quem acabou de salvar com sucesso. O custo
 * de errar é um arquivo órfão de 5 MB; o de lançar é a pessoa achar que a
 * edição não foi salva e refazer tudo.
 */
export const removerImagemDeAcontecimento = async (supabase, paths) => {
  const lista = [...new Set((Array.isArray(paths) ? paths : [paths])
    .map((p) => String(p || '').trim())
    .filter(Boolean))];
  if (lista.length === 0) return;
  try {
    await supabase.storage.from(CITY_EVENT_BUCKET).remove(lista);
  } catch {
    // Órfão no bucket é melhor que erro na cara de quem salvou.
  }
};
