import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { Capacitor } from '@capacitor/core';

import { pdfParaBase64, salvarDocumento } from '@/lib/nativeDownload';

const nomeSeguro = (valor) => String(valor || 'rua')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

/** Gera uma placa A4 horizontal pronta para impressão, com endereço público. */
export async function baixarPlacaDaRua({ nome, cep, bairro, cidade, url }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const qr = await QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: 'H' });

  // A placa ocupa praticamente toda a A4 horizontal. Os 4 mm externos evitam
  // apenas que impressoras comuns cortem a borda ao ajustar a página.
  doc.setFillColor(20, 91, 180);
  doc.roundedRect(4, 4, 289, 202, 6, 6, 'F');
  doc.setDrawColor(255, 221, 0);
  doc.setLineWidth(3.5);
  doc.roundedRect(10, 10, 277, 190, 4, 4, 'S');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  // O nome é a informação dominante. Reduz somente quando necessário para
  // manter nomes longos em até três linhas, sem disputar espaço com o QR code.
  let tamanhoDoNome = 42;
  let linhas = [];
  do {
    doc.setFontSize(tamanhoDoNome);
    linhas = doc.splitTextToSize(nome || 'Rua sem nome oficial', 190);
    if (linhas.length <= 3) break;
    tamanhoDoNome -= 2;
  } while (tamanhoDoNome > 28);
  const linhasVisiveis = linhas.slice(0, 3);
  const alturaDaLinha = tamanhoDoNome * 0.3528 * 1.08;
  const alturaDoNome = linhasVisiveis.length * alturaDaLinha;
  const nomeY = 25 + ((103 - alturaDoNome) / 2) + (alturaDaLinha * 0.8);
  doc.text(linhasVisiveis, 20, nomeY, { lineHeightFactor: 1.08 });

  const baseY = 142;
  doc.setFillColor(255, 221, 0);
  doc.roundedRect(18, baseY, 192, 43, 3, 3, 'F');
  doc.setTextColor(10, 55, 120);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text(`CEP: ${cep}`, 28, baseY + 18);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text([bairro, cidade].filter(Boolean).join(' - '), 28, baseY + 33, { maxWidth: 172 });

  // Alinhado à mesma margem óptica do cartão de CEP e grande o bastante para
  // leitura à distância. O próprio QR já traz sua área branca de respiro.
  doc.addImage(qr, 'PNG', 218, 22, 60, 60);

  const fileName = `placa-${nomeSeguro(nome)}-${String(cep).replace(/\D/g, '')}.pdf`;
  if (Capacitor.isNativePlatform()) {
    await salvarDocumento({ base64: pdfParaBase64(doc), fileName, tituloShare: 'Placa da rua' });
  } else {
    doc.save(fileName);
  }
}
