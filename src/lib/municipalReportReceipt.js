import { receiptPoint } from '@/components/report/ReceiptMap';
import { montarUrlDeTile, TILE_LIGHT } from '@/components/map/tileSources';
import { receiptCategory, receiptProblemFields } from '@/lib/reportReceiptDetails';

export const MUNICIPAL_RECEIPTS_BUCKET = 'municipal-report-receipts';

export const municipalReceiptPath = (reportId) => `${reportId}/comprovante.pdf`;

export function municipalReceiptDownloadUrl(signedUrl, report) {
  const url = new URL(signedUrl);
  const identifier = String(report.protocol || report.id).replace(/[^a-zA-Z0-9_-]/g, '-');
  url.searchParams.set('download', `comprovante-${identifier}.pdf`);
  return url.toString();
}

const formatDate = (value) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : 'Não informada';

const COLORS = {
  ink: '#0f172a', muted: '#64748b', line: '#e2e8f0', red: '#b91c1c',
  redText: '#991b1b', redBorder: '#fecaca', redBackground: '#fef2f2',
};

function roundedRect(ctx, x, y, width, height, radius = 16) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function loadReceiptLogo() {
  return new Promise((resolve) => {
    const logo = new Image();
    logo.onload = () => resolve(logo);
    logo.onerror = () => resolve(null);
    logo.src = '/logo.png';
  });
}

function wrapText(ctx, value, maxWidth, maxLines = 4) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const originalWord of words) {
    let word = originalWord;
    while (ctx.measureText(word).width > maxWidth) {
      if (line) { lines.push(line); line = ''; }
      let length = 1;
      while (length < word.length && ctx.measureText(word.slice(0, length + 1)).width <= maxWidth) length++;
      lines.push(word.slice(0, length));
      word = word.slice(length);
    }
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  while (ctx.measureText(`${visible[maxLines - 1]}…`).width > maxWidth) {
    visible[maxLines - 1] = visible[maxLines - 1].slice(0, -1);
  }
  visible[maxLines - 1] += '…';
  return visible;
}

async function drawLocationMap(ctx, location, y, height) {
  const point = receiptPoint(location);
  const x = 72;
  const width = 856;
  ctx.save();
  roundedRect(ctx, x, y, width, height);
  ctx.clip();
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y, width, height);
  if (!point) {
    ctx.fillStyle = '#475569';
    ctx.font = '22px Arial, sans-serif';
    ctx.fillText('Localização sem coordenadas para o mapa.', x + 20, y + height / 2);
    ctx.restore();
    return;
  }

  const zoom = 16;
  const size = 256;
  const world = size * 2 ** zoom;
  const radians = point.lat * Math.PI / 180;
  const centerX = (point.lng + 180) / 360 * world;
  const centerY = (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * world;
  const tiles = [];
  for (let tileX = Math.floor((centerX - width / 2) / size); tileX <= Math.floor((centerX + width / 2) / size); tileX++) {
    for (let tileY = Math.floor((centerY - height / 2) / size); tileY <= Math.floor((centerY + height / 2) / size); tileY++) {
      if (tileY < 0 || tileY >= 2 ** zoom) continue;
      tiles.push({ tileX, tileY });
    }
  }
  const images = await Promise.all(tiles.map(({ tileX, tileY }) => new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 8000);
    image.onload = () => { clearTimeout(timer); resolve({ image, tileX, tileY }); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.src = montarUrlDeTile(TILE_LIGHT, { z: zoom, x: ((tileX % 2 ** zoom) + 2 ** zoom) % 2 ** zoom, y: tileY });
  })));

  images.filter(Boolean).forEach(({ image, tileX, tileY }) => {
    ctx.drawImage(image, x + width / 2 + tileX * size - centerX, y + height / 2 + tileY * size - centerY, size, size);
  });
  if (images.every((image) => !image)) {
    ctx.fillStyle = '#475569';
    ctx.font = '22px Arial, sans-serif';
    ctx.fillText(`Mapa indisponível. Coordenadas: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}.`, x + 20, y + 45);
  }
  // Marcador com a mesma silhueta do pin da prévia.
  const pinX = x + width / 2;
  const pinY = y + height / 2;
  ctx.fillStyle = '#dc2626';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pinX, pinY + 19);
  ctx.bezierCurveTo(pinX - 10, pinY + 5, pinX - 17, pinY - 2, pinX - 17, pinY - 11);
  ctx.arc(pinX, pinY - 11, 17, Math.PI, 0);
  ctx.bezierCurveTo(pinX + 17, pinY - 2, pinX + 10, pinY + 5, pinX, pinY + 19);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(pinX, pinY - 11, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + width - 250, y + height - 25, 250, 25);
  ctx.fillStyle = '#334155';
  ctx.font = '15px Arial, sans-serif';
  ctx.fillText('© OpenStreetMap contributors', x + width - 242, y + height - 7);
  ctx.restore();
}

export async function renderMunicipalReportReceiptPdf(report) {
  if (!report?.id) throw new Error('Solicitação inválida para gerar o comprovante.');
  const logo = await loadReceiptLogo();
  const point = receiptPoint(report.location);
  const internal = Boolean(report.created_by_municipality && report.is_public === false);
  let canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 1414;
  let ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível criar a imagem do comprovante.');
  const pages = [canvas];
  const drawBrand = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1000, 1414);
    if (logo) ctx.drawImage(logo, 72, 42, 72, 72);
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillText('Trombone Cidadão', 160, 77);
    ctx.fillStyle = COLORS.muted;
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText('PAINEL DA PREFEITURA', 160, 108);
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(72, 148, 856, 2);
  };
  const nextPage = () => {
    canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1414;
    ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível criar uma página do comprovante.');
    pages.push(canvas);
    drawBrand();
    ctx.fillStyle = COLORS.red;
    ctx.font = 'bold 17px Arial, sans-serif';
    ctx.fillText('COMPROVANTE DE SOLICITAÇÃO DE SERVIÇO', 72, 188);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '18px Arial, sans-serif';
    ctx.fillText(`Protocolo: ${report.protocol || 'Não informado'}`, 72, 219, 856);
    return 230;
  };

  drawBrand();
  ctx.fillStyle = COLORS.red;
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.fillText('COMPROVANTE DE SOLICITAÇÃO DE SERVIÇO', 72, 198);
  ctx.fillStyle = COLORS.ink;
  ctx.font = 'bold 39px Arial, sans-serif';
  ctx.fillText('Solicitação registrada', 72, 250);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '21px Arial, sans-serif';
  const introduction = internal
    ? 'Registro interno da prefeitura, sem moderação e sem publicação no mapa público.'
    : 'Guarde este comprovante para acompanhar o andamento da solicitação.';
  wrapText(ctx, introduction, 856, 2).forEach((line, index) => ctx.fillText(line, 72, 290 + index * 26));

  const protocolTop = 326 + (wrapText(ctx, introduction, 856, 2).length - 1) * 26;
  roundedRect(ctx, 72, protocolTop, 856, 126);
  ctx.fillStyle = COLORS.redBackground;
  ctx.fill();
  ctx.strokeStyle = COLORS.redBorder;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = COLORS.redText;
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText('NÚMERO DO PROTOCOLO', 100, protocolTop + 42);
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillText(report.protocol || 'Não informado', 100, protocolTop + 90, 800);

  let y = protocolTop + 164;
  const fieldLines = (value, width) => {
    ctx.font = 'bold 23px Arial, sans-serif';
    return String(value || '').split(/\r?\n/).flatMap((paragraph) => paragraph.trim() ? wrapText(ctx, paragraph, width, Infinity) : ['']);
  };
  const drawRow = (fields) => {
    let measured = fields.map((field) => ({ ...field, lines: fieldLines(field.value, field.width) }));
    const height = 34 + Math.max(...measured.map((field) => Math.max(1, field.lines.length))) * 30 + 16;
    if (y + height > 1290) {
      y = nextPage();
      measured = fields.map((field) => ({ ...field, lines: fieldLines(field.value, field.width) }));
    }
    measured.forEach(({ label, x, width, lines }) => {
      ctx.fillStyle = COLORS.muted;
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText(label.toUpperCase(), x, y);
      ctx.fillStyle = COLORS.ink;
      ctx.font = 'bold 23px Arial, sans-serif';
      lines.forEach((line, index) => { if (line) ctx.fillText(line, x, y + 34 + index * 30, width); });
    });
    y += height;
  };
  const fullField = (label, value) => ({ label, value, x: 72, width: 856 });
  const halfField = (label, value, right = false) => ({ label, value, x: right ? 520 : 72, width: 408 });
  drawRow([fullField('Solicitação', report.title || 'Não informada')]);
  const problemFields = receiptProblemFields(report);
  drawRow([halfField('Categoria', receiptCategory(report)), ...(problemFields[0] ? [halfField(problemFields[0].label, problemFields[0].value, true)] : [])]);
  for (let index = 1; index < problemFields.length; index += 2) {
    drawRow(problemFields.slice(index, index + 2).map((field, offset) => halfField(field.label, field.value, offset === 1)));
  }
  const descriptionLines = fieldLines(report.description || 'Não informada', 856);
  let remaining = descriptionLines.length;
  let descriptionIndex = 0;
  while (remaining > 0) {
    if (y + 80 > 1290) y = nextPage();
    ctx.fillStyle = COLORS.muted;
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText(descriptionIndex ? 'DESCRIÇÃO DO PROBLEMA (CONTINUAÇÃO)' : 'DESCRIÇÃO DO PROBLEMA', 72, y);
    y += 34;
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 23px Arial, sans-serif';
    while (remaining && y + 30 <= 1290) {
      if (descriptionLines[descriptionIndex]) ctx.fillText(descriptionLines[descriptionIndex], 72, y, 856);
      descriptionIndex++;
      remaining--;
      y += 30;
    }
    y += 16;
  }
  drawRow([fullField('Endereço informado', report.address || 'Não informado')]);
  drawRow([halfField('Registrada em', formatDate(report.created_at)), halfField('Visibilidade', internal ? 'Apenas prefeitura' : 'Pública', true)]);

  let mapLink = null;
  if (point) {
    // Com dados curtos, o mapa fica na mesma folha; textos longos continuam sem cortes.
    if (y + 48 + 240 + 48 > 1300) y = nextPage();
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 21px Arial, sans-serif';
    ctx.fillText('Localização no mapa', 72, y + 26);
    const cardTop = y + 46;
    const mapHeight = Math.min(460, 1300 - cardTop - 48);
    await drawLocationMap(ctx, report.location, cardTop, mapHeight);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(72, cardTop + mapHeight, 856, 48);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '17px Arial, sans-serif';
    ctx.fillText('◉  Ponto informado no cadastro', 90, cardTop + mapHeight + 31);
    ctx.fillStyle = COLORS.red;
    ctx.font = 'bold 17px Arial, sans-serif';
    ctx.fillText('Abrir mapa ↗', 794, cardTop + mapHeight + 31);
    roundedRect(ctx, 72, cardTop, 856, mapHeight + 48);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    mapLink = { page: pages.length, x: 790, y: cardTop + mapHeight, url: `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=16/${point.lat}/${point.lng}` };
  }

  pages.forEach((page, index) => {
    const pageCtx = page.getContext('2d');
    pageCtx.fillStyle = COLORS.line;
    pageCtx.fillRect(72, 1336, 856, 2);
    pageCtx.fillStyle = COLORS.muted;
    pageCtx.font = '17px Arial, sans-serif';
    pageCtx.fillText('Acompanhe pelo número do protocolo.', 72, 1366);
    pageCtx.fillText(`Emitido em ${formatDate(new Date().toISOString())}`, 72, 1392);
    pageCtx.fillText(`${index + 1} / ${pages.length}`, 875, 1392);
  });

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage();
    pdf.addImage(page.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, 210, 297);
    if (mapLink?.page === index + 1) pdf.link(mapLink.x * 0.21, mapLink.y * 297 / 1414, 125 * 0.21, 48 * 297 / 1414, { url: mapLink.url });
  });
  return pdf.output('blob');
}

export async function saveMunicipalReportReceipt(client, report) {
  const blob = await renderMunicipalReportReceiptPdf(report);
  const path = municipalReceiptPath(report.id);
  const { error } = await client.storage.from(MUNICIPAL_RECEIPTS_BUCKET)
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  return path;
}

export async function loadMunicipalReportReceiptUrl(client, reportId) {
  const storage = client.storage.from(MUNICIPAL_RECEIPTS_BUCKET);
  const { data: files, error: listError } = await storage.list(reportId, { limit: 10 });
  if (listError) throw listError;
  if (!files?.some((file) => file.name === 'comprovante.pdf')) return null;
  const { data, error: signedError } = await storage.createSignedUrl(municipalReceiptPath(reportId), 3600);
  if (signedError) throw signedError;
  return data?.signedUrl || null;
}
