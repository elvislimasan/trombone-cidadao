import { DEMAND_PRIORITIES, DEMAND_STATUSES } from '../lib/municipalDemand.js';
import { exportLabel } from '../lib/municipalExport.js';
import { SERVICE_ORDER_INSTRUCTION, serviceOrderCoordinates } from '../lib/municipalServiceOrder.js';
import { rotuloDoTipoDeProblema } from '../lib/reportCategoryFields.js';

const text = (value) => String(value ?? '').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '');
const date = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString('pt-BR') : 'Não informado';

async function loadLogo(url) {
  if (typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const logo = new Image(); logo.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 4000);
    logo.onload = () => { clearTimeout(timer); resolve(logo); };
    logo.onerror = () => { clearTimeout(timer); resolve(null); };
    logo.src = url;
  });
}

export async function buildServiceOrderPdf({ order, reports = [], municipality, creatorName, generatedAt = new Date() }) {
  const [{ jsPDF }, tableModule, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo(municipality.logo_url || '/logo.png')]);
  const autoTable = typeof tableModule.default === 'function' ? tableModule.default : tableModule.default.default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 14;
  const ink = [30, 41, 59];
  const gray = [100, 116, 139];
  const services = reports.length ? reports : [{ id: order.id, protocol: order.protocolo, title: order.titulo, description: order.descricao, address: order.endereco, neighborhood: order.bairro, created_at: order.created_at, category: order.category, location: { lat: order.latitude, lng: order.longitude }, pole_id: order.pole_id, pole: order.pole }];
  doc.setProperties({ title: `Ordem de serviço ${order.protocolo}`, subject: order.titulo, author: order.criador?.name || creatorName || municipality.nome, creator: 'Trombone Cidadão' });
  let y = 44;
  const ensureSpace = (space) => { if (y + space > height - 17) { doc.addPage(); y = 44; } };
  const paragraph = (value, { size = 9, bold = false } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...ink);
    const lines = doc.splitTextToSize(text(value), width - margin * 2);
    for (const line of lines) { ensureSpace(5); doc.text(line, margin, y); y += 4.5; }
    y += 2;
  };
  const table = (options) => {
    autoTable(doc, { startY: y, margin: { left: margin, right: margin, top: 44, bottom: 17 }, styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.5, textColor: ink, lineColor: [203, 213, 225], lineWidth: 0.15, overflow: 'linebreak' }, headStyles: { fillColor: ink, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 250, 252] }, rowPageBreak: 'avoid', ...options });
    y = doc.lastAutoTable.finalY + 7;
  };
  paragraph(order.titulo, { size: 12, bold: true });
  const types = [...new Set(services.map((report) => report.category?.name || 'Não informado'))].join(', ');
  const neighborhoods = [...new Set(services.map((report) => report.neighborhood || 'Não informado'))].join(', ');
  table({ theme: 'grid', body: [
    ['Tipo de demanda', text(types), 'Bairros', text(neighborhoods)],
    ['Ocorrências / serviços', String(services.length), 'Status', text(exportLabel(DEMAND_STATUSES, order.status))],
    ['Setor de destino', text(order.secretaria?.nome || 'A definir'), 'Responsável', text(order.responsavel?.name || 'A definir')],
    ['Prioridade', text(exportLabel(DEMAND_PRIORITIES, order.prioridade)), 'Prazo', date(order.prazo_em)],
    ['Data de emissão', date(order.created_at), 'Gestor emissor', text(order.criador?.name || creatorName || 'Não informado')],
  ], columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold', fillColor: [248, 250, 252] }, 1: { cellWidth: 97 }, 2: { cellWidth: 37, fontStyle: 'bold', fillColor: [248, 250, 252] }, 3: { cellWidth: 97 } } });
  paragraph('INSTRUÇÃO À EQUIPE', { bold: true });
  paragraph(SERVICE_ORDER_INSTRUCTION);
  if (order.descricao) { paragraph('Orientações / observação do gestor', { bold: true }); paragraph(order.descricao); }
  paragraph('LOCAIS E SERVIÇOS A ATENDER', { bold: true });
  table({
    head: [['Nº', 'ID da demanda', 'Tipo', 'Endereço / local', 'Bairro', 'Referência / poste', 'Solicitada em', 'Problema / descrição', 'Prioridade', 'Coordenadas']],
    body: services.map((report, index) => {
      const pole = report.pole;
      const reference = [report.reference_point || report.reference, report.pole_id != null ? 'Poste: ' + (pole?.identifier || report.pole_number || report.pole_id) : report.pole_number ? 'Poste: ' + report.pole_number : '', pole?.plate ? 'Placa: ' + pole.plate : ''].filter(Boolean).join('\n') || 'Não informado';
      return [String(index + 1), report.protocol ? `${report.protocol}\n${report.id}` : report.id, report.category?.name || 'Não informado', report.address || pole?.address || 'Não informado', report.neighborhood || 'Não informado', reference, date(report.created_at), [report.title, report.issue_type && rotuloDoTipoDeProblema(report.category_id, report.issue_type), report.description].filter(Boolean).join('\n'), exportLabel(DEMAND_PRIORITIES, report.priority || order.prioridade), serviceOrderCoordinates(report)].map(text);
    }),
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2, textColor: ink, lineColor: [203, 213, 225], lineWidth: 0.15, overflow: 'linebreak', valign: 'top' },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 31 }, 2: { cellWidth: 22 }, 3: { cellWidth: 43 }, 4: { cellWidth: 23 }, 5: { cellWidth: 24 }, 6: { cellWidth: 22 }, 7: { cellWidth: 48 }, 8: { cellWidth: 18 }, 9: { cellWidth: 30 } },
  });
  ensureSpace(43);
  paragraph('REGISTRO DA EXECUÇÃO EM CAMPO', { size: 10, bold: true });
  paragraph('Responsável pela execução: ___________________________________________________       Data da execução: _____ / _____ / __________');
  paragraph('Assinatura: _______________________________________________________________________________________________');
  paragraph('Observações:', { bold: true });
  doc.setDrawColor(148, 163, 184);
  for (let index = 0; index < 2; index++) { y += 6; doc.line(margin, y, width - margin, y); }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const left = logo ? margin + 23 : margin;
    if (logo) {
      try {
        const ratio = Math.min(18 / logo.naturalWidth, 22 / logo.naturalHeight);
        doc.addImage(logo, margin, 10, logo.naturalWidth * ratio, logo.naturalHeight * ratio);
      } catch { /* The institutional name still identifies the issuing authority. */ }
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ink);
    doc.text(text(municipality.nome), left, 13, { maxWidth: width - left - margin - 78 });
    doc.setFontSize(20); doc.text('ORDEM DE SERVIÇO', left, 24);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gray);
    doc.text(text([municipality.cidade?.name, municipality.cidade?.states?.uf].filter(Boolean).join(' / ')), left, 31);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ink);
    doc.text(text(order.protocolo), width - margin, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const emittedAt = new Date(order.created_at || generatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    doc.text(`Emissão: ${emittedAt}`, width - margin, 23, { align: 'right' });
    doc.setDrawColor(51, 65, 85); doc.line(margin, 36, width - margin, 36);
    doc.setDrawColor(203, 213, 225); doc.line(margin, height - 13, width - margin, height - 13);
    doc.setFontSize(7); doc.setTextColor(...gray);
    doc.text(text(`Ordem ${order.protocolo} | ${services.length} serviços | Trombone Cidadão`), margin, height - 8);
    doc.text(`Página ${page} de ${pages}`, width - margin, height - 8, { align: 'right' });
  }
  return doc;
}

export async function downloadServiceOrderPdf(options) {
  const doc = await buildServiceOrderPdf(options);
  doc.save(`ordem-de-servico-${options.order.protocolo.replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`);
}
