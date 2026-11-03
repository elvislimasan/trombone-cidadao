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

function drawStoryPhoto(ctx, img, entry, label, x, y, width, height) {
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, width, height, 40); ctx.clip();
  const ratio = Math.max(width / img.width, height / img.height);
  ctx.drawImage(img, x + (width - img.width * ratio) / 2, y + (height - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
  const stampDate = dateLabel(entry.date);
  ctx.font = '700 32px Arial'; const labelWidth = ctx.measureText(label).width;
  ctx.font = '31px Arial'; const rest = stampDate ? ` · ${stampDate}` : '';
  const stampWidth = labelWidth + ctx.measureText(rest).width + 54;
  roundBox(ctx, x + 28, y + 28, stampWidth, 64, 32, 'rgba(250,248,238,.97)');
  ctx.fillStyle = '#173e29'; ctx.font = '700 32px Arial'; ctx.fillText(label, x + 55, y + 71);
  ctx.font = '31px Arial'; ctx.fillText(rest, x + 55 + labelWidth, y + 71);
  ctx.restore();
}

async function drawStory(ctx, { tree, before, after, beforeImage, afterImage, logo, comparison, url }) {
  ctx.fillStyle = '#faf7ed'; ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = '#e9eedb'; ctx.beginPath(); ctx.ellipse(1090, -10, 350, 310, -.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8e3c3'; ctx.beginPath(); ctx.ellipse(1020, 58, 49, 122, .62, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(logo, 76, 50, 90, 90 * logo.height / logo.width);
  ctx.strokeStyle = '#6c795d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(190, 65); ctx.lineTo(190, 110); ctx.stroke();
  ctx.fillStyle = '#791d18'; ctx.font = '700 32px Arial'; ctx.fillText('TROMBONE CIDADÃO', 214, 101);

  ctx.fillStyle = '#092f1f'; ctx.font = '700 110px Georgia'; ctx.fillText('Uma cidade em', 76, 246, 930);
  ctx.font = 'italic 700 116px Georgia'; ctx.fillText('transformação', 76, 344, 930);
  roundBox(ctx, 76, 389, 120, 11, 5, '#8ca541');
  ctx.fillStyle = '#35563a'; ctx.font = '36px Arial';
  wrapText(ctx, [tree.species_name || tree.name, tree.city_name].filter(Boolean).join(' · '), 230, 411, 780, 42, 1);

  if (comparison) {
    drawStoryPhoto(ctx, beforeImage, before, 'ANTES', 48, 462, 984, 455);
    ctx.strokeStyle = '#8caa68'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(540, 917); ctx.lineTo(540, 1004); ctx.stroke();
    ctx.fillStyle = '#436e43'; ctx.beginPath(); ctx.arc(540, 960, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(531, 959); ctx.lineTo(538, 966); ctx.lineTo(550, 952); ctx.stroke();
    drawStoryPhoto(ctx, afterImage, after, 'DEPOIS', 48, 1004, 984, 465);
  } else drawStoryPhoto(ctx, beforeImage, before, 'PRIMEIRO REGISTRO', 48, 462, 984, 1007);

  const footer = ctx.createLinearGradient(0, 1524, 1080, 1920); footer.addColorStop(0, '#104d32'); footer.addColorStop(1, '#103b29');
  ctx.fillStyle = footer; ctx.beginPath(); ctx.moveTo(0, 1614); ctx.quadraticCurveTo(0, 1524, 90, 1524); ctx.lineTo(990, 1524); ctx.quadraticCurveTo(1080, 1524, 1080, 1614); ctx.lineTo(1080, 1920); ctx.lineTo(0, 1920); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f8f6e9'; ctx.font = '700 76px Georgia'; ctx.fillText('Acompanhe essa', 82, 1640, 630); ctx.fillText(comparison ? 'transformação' : 'história crescer', 82, 1713, 630);
  ctx.strokeStyle = '#e0eacf'; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(82, 1757, 578, 80, 40); ctx.stroke();
  ctx.font = '600 38px Arial'; ctx.textAlign = 'center'; ctx.fillText('Veja a história completa', 371, 1808, 532); ctx.textAlign = 'left';
  ctx.strokeStyle = '#96b172'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(724, 1608); ctx.lineTo(724, 1822); ctx.stroke();
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, url, { width: 204, margin: 2, color: { dark: '#123e28', light: '#ffffff' } });
  roundBox(ctx, 782, 1598, 224, 224, 18, '#fff'); ctx.drawImage(qr, 792, 1608);
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
  const url = new URL(`/arvores-da-comunidade/${encodeURIComponent(tree.id)}`, getBaseAppUrl()).href;
  if (format === 'story') {
    await drawStory(ctx, { tree: freshTree, before, after, beforeImage, afterImage, logo, comparison, url });
    return { dataUrl: canvas.toDataURL('image/png'), url, fileName: `story-minha-arvore-${tree.id.slice(0, 8)}.png`, format, ...dimensions, photos, beforeId: before.id, afterId: after.id, comparison };
  }
  ctx.fillStyle = '#f5f3e9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e3ead7'; ctx.beginPath(); ctx.ellipse(1050, 80, 310, 290, -.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d2dfc6'; ctx.beginPath(); ctx.ellipse(1010, 85, 46, 102, .6, 0, Math.PI * 2); ctx.fill();
  const top = 64;
  ctx.drawImage(logo, 48, top - 43, 64, 64 * logo.height / logo.width);
  ctx.fillStyle = '#651b1b'; ctx.font = '700 25px Arial'; ctx.fillText('TROMBONE CIDADÃO', 128, top);
  ctx.fillStyle = '#183e29'; ctx.font = '700 68px Georgia'; const lines = wrapText(ctx, freshTree.name, 48, top + 106, 980, 73);
  const titleBottom = top + 106 + (lines - 1) * 73;
  ctx.fillStyle = '#576950'; ctx.font = '27px Arial'; wrapText(ctx, [freshTree.species_name, freshTree.city_name].filter(Boolean).join(' · '), 50, titleBottom + 48, 960, 33, 1);
  const photoTop = titleBottom + 88; let photoBottom;
  if (comparison) {
    drawPhoto(ctx, beforeImage, before, 'ANTES', 48, photoTop, 480, 538);
    drawPhoto(ctx, afterImage, after, 'DEPOIS', 552, photoTop, 480, 538); photoBottom = photoTop + 538;
  } else {
    drawPhoto(ctx, beforeImage, before, 'PRIMEIRO REGISTRO', 48, photoTop, 984, 538); photoBottom = photoTop + 538;
  }
  const footerTop = photoBottom + 32, footerBottom = dimensions.height - 48;
  roundBox(ctx, 48, footerTop, 984, footerBottom - footerTop, 28, '#173e2a');
  ctx.fillStyle = '#f6f4e9'; ctx.font = '700 44px Georgia'; wrapText(ctx, comparison ? 'Cuidado que vira transformação.' : 'Toda história começa com um cuidado.', 80, footerTop + 70, 690, 53);
  ctx.fillStyle = '#c5d8b7'; ctx.font = '23px Arial'; ctx.fillText('Acompanhe essa história', 80, footerTop + 204);
  ctx.drawImage(logo, 80, footerBottom - 73, 46, 46 * logo.height / logo.width);
  ctx.fillStyle = '#f6f4e9'; ctx.font = '700 23px Arial'; ctx.fillText('Trombone Cidadão', 138, footerBottom - 47);
  const qr = document.createElement('canvas'); await QRCode.toCanvas(qr, url, { width: 148, margin: 1, color: { dark: '#173e2a', light: '#ffffff' } });
  roundBox(ctx, 832, footerTop + 52, 168, 168, 16, '#fff'); ctx.drawImage(qr, 842, footerTop + 62);
  return { dataUrl: canvas.toDataURL('image/png'), url, fileName: `feed-minha-arvore-${tree.id.slice(0, 8)}.png`, format, ...dimensions, photos, beforeId: before.id, afterId: after.id, comparison };
}
