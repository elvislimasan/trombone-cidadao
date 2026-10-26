import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

const GREEN = [8, 87, 63];
const INK = [24, 43, 36];
const MUTED = [82, 101, 92];

function centeredText(doc, value, { top, height, width = 122, size = 12, minSize = 8, maxLines = 2, font = 'normal', color = INK, x = 74 }) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return;
  doc.setFont('helvetica', font);
  let lines, leading;
  for (; size >= minSize; size -= 0.5) {
    doc.setFontSize(size);
    lines = doc.splitTextToSize(text, width);
    leading = size / doc.internal.scaleFactor * 1.1;
    if (lines.length <= maxLines && leading * lines.length <= height) break;
  }
  size = Math.max(size, minSize);
  doc.setFontSize(size);
  leading = size / doc.internal.scaleFactor * 1.1;
  lines = doc.splitTextToSize(text, width);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1].trimEnd();
    while (last && doc.getTextWidth(`${last}...`) > width) last = last.slice(0, -1).trimEnd();
    lines[maxLines - 1] = `${last}...`;
  }
  doc.setTextColor(...color);
  const baseline = top + (height - (lines.length - 1) * leading) / 2 + size / doc.internal.scaleFactor * 0.32;
  lines.forEach((line, index) => doc.text(line, x, baseline + index * leading, { align: 'center' }));
}

export async function createTreeQrCodePdf(tree, cityName, url) {
  const qr = await QRCode.toDataURL(url, { width: 1600, margin: 4, errorCorrectionLevel: 'H', color: { dark: '#000000', light: '#ffffff' } });
  const doc = new jsPDF({ unit: 'mm', format: 'a5', compress: true });
  doc.setProperties({ title: `Identificação de ${tree.common_name || 'árvore'} · ${tree.public_code || tree.id}`, author: 'Trombone Cidadão', subject: 'Placa de identificação de árvore para impressão em A5' });

  // A placa ocupa a página A5, com margem para corte e plastificação.
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, 148, 210, 'F');
  doc.setDrawColor(206, 220, 212); doc.setLineWidth(0.3);
  doc.roundedRect(6, 6, 136, 198, 4, 4, 'S');
  doc.setFillColor(...GREEN); doc.roundedRect(6, 6, 136, 24, 4, 4, 'F');
  doc.rect(6, 18, 136, 12, 'F');

  // Símbolo vetorial: permanece nítido na impressão, sem carregar imagens.
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.65);
  doc.circle(17, 15, 3.4, 'S'); doc.circle(13.8, 18.2, 2.8, 'S'); doc.circle(20.2, 18.2, 2.8, 'S');
  doc.line(17, 18, 17, 25); doc.line(14.8, 21, 17, 23); doc.line(19.2, 21, 17, 23);
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('ÁRVORE DA CIDADE', 28, 15.8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('Trombone Cidadão', 28, 22.2);
  doc.setDrawColor(112, 158, 134); doc.setLineWidth(0.25); doc.line(105, 10, 105, 26);
  doc.setTextColor(220, 237, 227); doc.setFontSize(6.8);
  doc.text(tree.public_code ? 'CÓDIGO DA ÁRVORE' : 'IDENTIFICAÇÃO', 123, 12.8, { align: 'center' });
  centeredText(doc, tree.public_code || tree.id, { top: 15, height: 12, width: 30, size: 20, minSize: 7, maxLines: 3, font: 'bold', color: [255, 255, 255], x: 123 });

  centeredText(doc, tree.common_name || 'Árvore não identificada', { top: 33, height: tree.scientific_name ? 21 : 29, size: tree.scientific_name ? 26 : 30, minSize: 14, maxLines: 3, font: 'bold' });
  if (tree.scientific_name) centeredText(doc, tree.scientific_name, { top: 55, height: 9, size: 10, minSize: 8, font: 'italic', color: MUTED });
  centeredText(doc, [cityName, tree.neighborhood].filter(Boolean).join(' · '), { top: 65, height: 8, size: 9, minSize: 7.5, color: MUTED });

  // O QR mantém fundo branco e quatro módulos de respiro em todos os lados.
  doc.setDrawColor(222, 231, 226); doc.setLineWidth(0.3); doc.roundedRect(20, 75, 108, 104, 4, 4, 'S');
  doc.addImage(qr, 'PNG', 24, 77, 100, 100);
  doc.link(24, 77, 100, 100, { url });
  centeredText(doc, 'Aponte a câmera do celular', { top: 183, height: 6, size: 12, minSize: 11, maxLines: 1, font: 'bold', color: GREEN });
  centeredText(doc, 'Conheça esta árvore e acompanhe seus cuidados.', { top: 190, height: 4, size: 8.5, minSize: 8, maxLines: 1, color: MUTED });
  doc.setDrawColor(222, 231, 226); doc.line(18, 197, 130, 197);
  const host = new URL(url).host.replace(/^www\./, '');
  centeredText(doc, host, { top: 198, height: 4, size: 8, minSize: 6, maxLines: 1, color: MUTED });
  doc.link(18, 198, 112, 5, { url });
  return doc;
}
