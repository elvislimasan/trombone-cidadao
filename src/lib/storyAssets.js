import { getCardInstagramPublicUrl } from '@/lib/cardInstagramAssets';

// Imagens de card de story: como trazê-las sem sujar o canvas.
//
// O `toPng` precisa ler os pixels de cada <img> para desenhar no canvas. Uma
// imagem servida sem header CORS "suja" (taints) o canvas, e a partir daí
// qualquer leitura lança — era a causa do "erro ao baixar" do card de bronca.
// Buscando por fetch e embutindo como data URI, a imagem passa a ser
// same-origin para o canvas.
//
// Estava dentro do ReportStoryModal. Saiu de lá quando o card da patrulha
// passou a ter fundo próprio no mesmo bucket: dois lugares convertendo imagem
// para data URI seriam dois lugares para descobrir de novo, no primeiro card
// que voltasse a falhar, que o problema era CORS.

/**
 * Baixa e converte em data URI.
 *
 * Best-effort de propósito: falhando, devolve string vazia e o card renderiza
 * sem aquele elemento. Um fundo que não carregou vale muito mais que uma
 * exportação derrubada — o card sai com o degradê de reserva e a pessoa
 * publica assim mesmo.
 */
export const toDataUri = async (url) => {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  try {
    const response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
    if (!response.ok) return '';
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
};

/** Arquivo do bucket `card-instagram`, já em data URI. */
export const bucketDataUri = (arquivo) =>
  toDataUri(getCardInstagramPublicUrl(arquivo));

/** Fundo do card da patrulha. Vive no mesmo bucket dos fundos de bronca. */
export const ARQUIVO_FUNDO_PATRULHA = 'bg-patrulha.png';
