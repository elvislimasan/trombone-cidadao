import QRCode from 'qrcode';
import { communityRpc, hydrateCommunityPhotos } from './communityTrees';
import { getBaseAppUrl } from './shareUtils';

export const COMMUNITY_SHARE_FORMATS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } };

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || '').split(/\s+/), lines = []; let line = '';
  for (const word of words) {
    if (line && ctx.measureText(`${line} ${word}`).width > maxWidth) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { let last = lines[maxLines - 1]; while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1); lines[maxLines - 1] = last + '…'; }
  lines.slice(0, maxLines).forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight, maxWidth));
  return Math.min(lines.length, maxLines);
}
const dateLabel = value => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '';

async function photo(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Não foi possível carregar uma foto. Tente novamente.');
  const objectUrl = URL.createObjectURL(await response.blob());
  try { const img = new Image(); img.src = objectUrl; await img.decode(); return img; } finally { URL.revokeObjectURL(objectUrl); }
}
function roundBox(ctx, x, y, width, height, radius, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
}
function drawPhoto(ctx, img, entry, label, x, y, width, height) {
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, width, height, 28); ctx.clip();
  const ratio = Math.max(width / img.width, height / img.height);
  ctx.drawImage(img, x + (width - img.width * ratio) / 2, y + (height - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
  const shade = ctx.createLinearGradient(0, y + height * .6, 0, y + height); shade.addColorStop(0, 'transparent'); shade.addColorStop(1, 'rgba(6,31,18,.78)');
  ctx.fillStyle = shade; ctx.fillRect(x, y, width, height);
  ctx.font = '700 21px Arial'; const pillWidth = ctx.measureText(label).width + 42;
  roundBox(ctx, x + 22, y + 22, pillWidth, 46, 23, '#f6f4eb'); ctx.fillStyle = '#214a32'; ctx.fillText(label, x + 43, y + 52);
  ctx.fillStyle = '#fff'; ctx.font = '500 25px Arial'; ctx.fillText(dateLabel(entry.date), x + 26, y + height - 28);
  ctx.restore();
}

export function communityComparison(photos, { beforeId, afterId } = {}) {
  const first = beforeId ? photos.find(entry => entry.id === beforeId) : photos[0];
  const last = afterId ? photos.find(entry => entry.id === afterId) : photos.at(-1);
  if (!first || !last) throw new Error('A foto selecionada não está mais pública. Atualize a seleção.');
  if (photos.length > 1 && first.id === last.id) throw new Error('Escolha duas fotos diferentes para comparar.');
  if (photos.length > 1 && first.date?.slice(0, 10) > last.date?.slice(0, 10)) throw new Error('A foto do depois deve ser da mesma data ou mais recente.');
  return { before: first, after: last, comparison: first.id !== last.id };
}

export async function generateCommunityTreeCard(client, tree, _care, options = {}) {
  const format = options.format || 'story', dimensions = COMMUNITY_SHARE_FORMATS[format];
  if (!dimensions) throw new Error('Escolha um formato de compartilhamento válido.');
  // Recheck publication and photo visibility on every export, including selections.
  const current = await communityRpc(client, 'get_community_tree', { p_id: tree.id });
  if (!current || current.status !== 'approved' || !current.public_profile) throw new Error('O perfil precisa estar aprovado e público para compartilhar.');
  const entries = await communityRpc(client, 'list_community_tree_care', { p_tree: tree.id, p_limit: 100, p_offset: 0 });
  const publicPhotos = (entries || []).filter(entry => entry.is_public && !entry.is_hidden && entry.photo_path);
  if (current.latest_public_care?.photo_path && !publicPhotos.some(entry => entry.photo_path === current.latest_public_care.photo_path)) publicPhotos.push({ ...current.latest_public_care, id: current.latest_public_care.photo_path });
  const [freshTree, ...freshCare] = await hydrateCommunityPhotos(client, [current, ...publicPhotos]);
  const photos = [...(freshTree.photo_url ? [{ id: 'cover', url: freshTree.photo_url, date: freshTree.created_at, label: 'Foto de capa' }] : []), ...freshCare.filter(entry => entry.photo_url).map(entry => ({ id: entry.id, url: entry.photo_url, date: entry.performed_on, label: 'Foto do diário' }))].sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)));
  if (!photos.length) throw new Error('Adicione uma foto pública para criar seu story.');
  let selection;
  try { selection = communityComparison(photos, options); } catch (error) { error.photos = photos; throw error; }
  const { before, after, comparison } = selection;
  const [beforeImage, afterImage, logo] = await Promise.all([photo(before.url), comparison ? photo(after.url) : Promise.resolve(null), photo('/logo.png')]);
  const canvas = document.createElement('canvas'); Object.assign(canvas, dimensions); const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f5f3e9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e3ead7'; ctx.beginPath(); ctx.ellipse(1050, 80, 310, 290, -.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d2dfc6'; ctx.beginPath(); ctx.ellipse(1010, 85, 46, 102, .6, 0, Math.PI * 2); ctx.fill();
  const story = format === 'story', top = story ? 144 : 64;
  ctx.drawImage(logo, 48, top - 43, 64, 64 * logo.height / logo.width);
  ctx.fillStyle = '#651b1b'; ctx.font = '700 25px Arial'; ctx.fillText('TROMBONE CIDADÃO', 128, top);
  ctx.fillStyle = '#183e29'; ctx.font = '700 68px Georgia'; const lines = wrapText(ctx, freshTree.name, 48, top + 106, 980, 73);
  const titleBottom = top + 106 + (lines - 1) * 73;
  ctx.fillStyle = '#576950'; ctx.font = '27px Arial'; wrapText(ctx, [freshTree.species_name, freshTree.city_name].filter(Boolean).join(' · '), 50, titleBottom + 48, 960, 33, 1);
  const photoTop = titleBottom + 88; let photoBottom;
  if (story && comparison) {
    drawPhoto(ctx, beforeImage, before, 'ANTES', 48, photoTop, 984, 460);
    drawPhoto(ctx, afterImage, after, 'DEPOIS', 48, photoTop + 484, 984, 460); photoBottom = photoTop + 944;
  } else if (comparison) {
    drawPhoto(ctx, beforeImage, before, 'ANTES', 48, photoTop, 480, 538);
    drawPhoto(ctx, afterImage, after, 'DEPOIS', 552, photoTop, 480, 538); photoBottom = photoTop + 538;
  } else {
    const height = story ? 880 : 538; drawPhoto(ctx, beforeImage, before, 'PRIMEIRO REGISTRO', 48, photoTop, 984, height); photoBottom = photoTop + height;
  }
  const footerTop = photoBottom + 32, footerBottom = dimensions.height - (story ? 144 : 48);
  roundBox(ctx, 48, footerTop, 984, footerBottom - footerTop, 28, '#173e2a');
  ctx.fillStyle = '#f6f4e9'; ctx.font = '700 44px Georgia'; wrapText(ctx, comparison ? 'Cuidado que vira transformação.' : 'Toda história começa com um cuidado.', 80, footerTop + 70, 690, 53);
  ctx.fillStyle = '#c5d8b7'; ctx.font = '23px Arial'; ctx.fillText('Acompanhe essa história', 80, footerTop + 204);
  ctx.drawImage(logo, 80, footerBottom - 73, 46, 46 * logo.height / logo.width);
  ctx.fillStyle = '#f6f4e9'; ctx.font = '700 23px Arial'; ctx.fillText('Trombone Cidadão', 138, footerBottom - 47);
  const url = new URL(`/arvores-da-comunidade/${encodeURIComponent(tree.id)}`, getBaseAppUrl()).href;
  const qr = document.createElement('canvas'); await QRCode.toCanvas(qr, url, { width: 148, margin: 1, color: { dark: '#173e2a', light: '#ffffff' } });
  roundBox(ctx, 832, footerTop + 52, 168, 168, 16, '#fff'); ctx.drawImage(qr, 842, footerTop + 62);
  return { dataUrl: canvas.toDataURL('image/png'), url, fileName: `${story ? 'story' : 'feed'}-minha-arvore-${tree.id.slice(0, 8)}.png`, format, ...dimensions, photos, beforeId: before.id, afterId: after.id, comparison };
}
