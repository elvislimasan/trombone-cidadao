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
  : null;

function wrapText(ctx, value, maxWidth) {
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
  return lines.length ? lines : ['—'];
}

export async function renderMunicipalReportReceiptPdf(report) {
  if (!report?.id) throw new Error('Solicitação inválida para gerar o comprovante.');
  const pages = [];
  let ctx;
  let y;
  // Coluna de 110 mm centralizada na página A4, como um recibo de impressão.
  const x = 238;
  const width = 524;
  const rule = (position, dashed = false) => {
    ctx.beginPath();
    ctx.setLineDash(dashed ? [8, 7] : []);
    ctx.moveTo(x, position);
    ctx.lineTo(x + width, position);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const newPage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1414;
    ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível criar a imagem do comprovante.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.font = 'bold 27px Arial, sans-serif';
    ctx.fillText('COMPROVANTE DE SOLICITAÇÃO', x, 100, width);
    rule(126);
    pages.push(canvas);
    y = 160;
  };
  const drawField = (label, value, large = false) => {
    ctx.font = large ? 'bold 34px Arial, sans-serif' : '23px Arial, sans-serif';
    const lines = wrapText(ctx, value, width);
    const lineHeight = large ? 42 : 31;
    let index = 0;
    while (index < lines.length) {
      if (y + 37 + lineHeight + 22 > 1290) newPage();
      ctx.font = 'bold 17px Arial, sans-serif';
      ctx.fillText(index ? `${label.toUpperCase()} (CONTINUAÇÃO)` : label.toUpperCase(), x, y);
      y += 37;
      ctx.font = large ? 'bold 34px Arial, sans-serif' : '23px Arial, sans-serif';
      while (index < lines.length && y + lineHeight + 22 <= 1290) {
        ctx.fillText(lines[index], x, y);
        index++;
        y += lineHeight;
      }
      y += 22;
      rule(y, true);
      y += 32;
    }
  };

  newPage();
  drawField('Protocolo', report.protocol || 'Não informado', true);
  drawField('Solicitação', report.title || 'Não informada');
  drawField('Categoria', receiptCategory(report));
  receiptProblemFields(report).forEach(({ label, value }) => drawField(label, value));
  if (report.address) drawField('Endereço', report.address);
  const date = formatDate(report.created_at);
  if (date) drawField('Registrada em', date);

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage();
    pdf.addImage(page.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
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
