import QRCode from 'qrcode';
import { communityRpc, communityShareData, hydrateCommunityPhotos } from './communityTrees';
import { getBaseAppUrl } from './shareUtils';

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || '').split(/\s+/); const lines = []; let line = '';
  for (const word of words) {
    if (line && ctx.measureText(`${line} ${word}`).width > maxWidth) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
}

async function photo(url) {
  if (!url) return null;
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Não foi possível carregar uma foto do cartão. Tente novamente.');
  const objectUrl = URL.createObjectURL(await response.blob());
  try { const img = new Image(); img.src = objectUrl; await img.decode(); return img; } finally { URL.revokeObjectURL(objectUrl); }
}

function drawCover(ctx, img, x, y, width, height) {
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, width, height, 26); ctx.clip();
  ctx.fillStyle = '#e4f1e9'; ctx.fillRect(x, y, width, height);
  if (img) {
    const ratio = Math.max(width / img.width, height / img.height);
    ctx.drawImage(img, x + (width - img.width * ratio) / 2, y + (height - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
  } else { ctx.fillStyle = '#15583e'; ctx.font = '600 24px Arial'; ctx.fillText('Um cuidado que cresce', x + 28, y + height / 2); }
  ctx.restore();
}

export async function generateCommunityTreeCard(client, tree, care) {
  // Confere novamente a publicação e busca a última foto pública, inclusive
  // quando ela está além da primeira página de cuidados do proprietário.
  const current = await communityRpc(client, 'get_community_tree', { p_id: tree.id });
  if (!current || current.status !== 'approved' || !current.public_profile) throw new Error('O perfil precisa estar aprovado e público para compartilhar.');
  const [freshTree, ...freshCare] = await hydrateCommunityPhotos(client, [current, ...(current.latest_public_care ? [current.latest_public_care] : care)]);
  const data = communityShareData(freshTree, freshCare);
  if (!data) throw new Error('O compartilhamento fica disponível após a aprovação do perfil público.');
  const [before, after] = await Promise.all([photo(data.before), photo(data.after)]);
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350); gradient.addColorStop(0, '#0c3d2a'); gradient.addColorStop(1, '#155c40');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = '#b3ebc8'; ctx.font = '700 24px Arial'; ctx.fillText('TROMBONE CIDADÃO · ÁRVORES DA COMUNIDADE', 64, 82);
  ctx.fillStyle = '#ffffff'; ctx.font = '700 62px Arial'; wrapText(ctx, data.name, 64, 172, 950, 72);
  ctx.fillStyle = '#d4e9dc'; ctx.font = '28px Arial'; wrapText(ctx, [data.species, data.city].filter(Boolean).join(' · '), 64, 305, 950, 36);
  drawCover(ctx, before, 64, 388, 466, 520); drawCover(ctx, after, 550, 388, 466, 520);
  ctx.fillStyle = '#ffffff'; ctx.font = '700 26px Arial'; ctx.fillText('Primeiro registro', 68, 954); ctx.fillText('Acompanhamento', 554, 954);
  const date = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '';
  ctx.fillStyle = '#c3e1cf'; ctx.font = '24px Arial'; ctx.fillText(date(data.beforeDate), 68, 993); ctx.fillText(date(data.afterDate), 554, 993);
  ctx.fillStyle = '#ffffff'; ctx.font = '700 44px Arial'; ctx.fillText('Uma árvore. Um cuidado contínuo.', 64, 1094);
  ctx.font = '28px Arial'; ctx.fillStyle = '#c3e1cf'; ctx.fillText(`${data.count} ${data.count === 1 ? 'cuidado público registrado' : 'cuidados públicos registrados'}`, 64, 1150);
  const url = new URL(data.path, getBaseAppUrl()).href;
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, url, { width: 148, margin: 2, color: { dark: '#0c3d2a', light: '#ffffff' } });
  ctx.drawImage(qr, 868, 1170);
  ctx.fillStyle = '#ffffff'; ctx.font = '26px Arial'; ctx.fillText('Cada cuidado faz diferença.', 64, 1240);
  ctx.fillStyle = '#b3ebc8'; ctx.font = '22px Arial'; ctx.fillText('Leia o QR Code e acompanhe essa história.', 64, 1284);
  return { dataUrl: canvas.toDataURL('image/png'), url, fileName: `minha-arvore-${tree.id.slice(0, 8)}.png` };
}
