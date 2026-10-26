import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { Capacitor } from '@capacitor/core';
import { getBaseAppUrl } from './shareUtils';
import { pdfParaBase64, salvarDocumento } from './nativeDownload';

export async function downloadTreeQrCode(tree, cityName) {
  const url = `${getBaseAppUrl().replace(/\/$/, '')}/arborizacao/arvore/${encodeURIComponent(tree.id)}`;
  const qr = await QRCode.toDataURL(url, { width: 1200, margin: 4, errorCorrectionLevel: 'H', color: { dark: '#000000', light: '#ffffff' } });
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(18); doc.text('Identificação da árvore', 105, 30, { align: 'center' });
  doc.setFontSize(16); doc.text(doc.splitTextToSize(tree.common_name || 'Árvore', 170), 105, 43, { align: 'center' });
  if (tree.scientific_name) { doc.setFontSize(11); doc.text(doc.splitTextToSize(tree.scientific_name, 170), 105, 64, { align: 'center' }); }
  doc.addImage(qr, 'PNG', 55, 78, 100, 100);
  doc.setFontSize(14); doc.text(tree.public_code || tree.id, 105, 188, { align: 'center' });
  doc.setFontSize(11); doc.text(doc.splitTextToSize([cityName, tree.neighborhood].filter(Boolean).join(' · '), 170), 105, 201, { align: 'center' });
  doc.text('Escaneie para conhecer esta árvore e seu histórico.', 105, 220, { align: 'center' });
  doc.setFontSize(8); doc.textWithLink('Abrir cadastro da árvore', 87, 230, { url });
  const fileName = `arvore-${String(tree.public_code || tree.id).replace(/[^a-zA-Z0-9_-]/g, '-')}-qrcode.pdf`;
  if (Capacitor.isNativePlatform()) await salvarDocumento({ base64: pdfParaBase64(doc), fileName, contentType: 'application/pdf', tituloShare: 'Identificação da árvore' });
  else doc.save(fileName);
}
