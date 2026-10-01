import { groupExportRecords } from '../lib/municipalExport.js';

const date = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString('pt-BR') : 'Não informado';
// Standard PDF fonts cover Portuguese accents; normalize unsupported typographic characters.
const pdfText = (value) => String(value ?? '').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '');
const quoteCsv = (value) => {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
};

export function municipalExportCsv(records, kind, groupBy = 'none') {
  const demands = kind === 'demands';
  const headers = demands
    ? ['Protocolo', 'Título', 'Descrição', 'Categoria', 'Endereço', 'Bairro', 'Secretaria', 'Responsável', 'Prioridade', 'Status', 'Criada em', 'Prazo', 'Previsão', 'Próxima ação', 'Data da próxima ação', 'Atrasada', 'Revisão pendente', 'Solicitações vinculadas', 'Endereços vinculados', 'Bairros vinculados']
    : ['ID', 'Título', 'Descrição', 'Categoria', 'Endereço', 'Bairro', 'Status', 'Publicada em', 'Idade (dias)', 'Ordem de serviço', 'Secretaria', 'Responsável'];
  const rows = groupExportRecords(records, groupBy).flatMap((group) => group.rows).map((item) => demands
    ? [item.reference, item.title, item.description, item.category, item.address, item.neighborhood, item.channel, item.responsible, item.priority, item.status, date(item.createdAt), date(item.dueAt), date(item.forecastAt), item.nextAction, date(item.nextActionAt), item.overdue ? 'Sim' : 'Não', item.review ? 'Sim' : 'Não', item.linkedLocations?.length || 0, (item.linkedLocations || []).map((location, index) => `${index + 1}. ${location.address || 'Endereço não informado'}`).join('\n'), (item.linkedLocations || []).map((location, index) => `${index + 1}. ${location.neighborhood || 'Bairro não informado'}`).join('\n')]
    : [item.id, item.title, item.description, item.category, item.address, item.neighborhood, item.status, date(item.createdAt), item.age, item.orderReference, item.channel, item.responsible]);
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(quoteCsv).join(';')).join('\r\n');
}

export async function buildMunicipalExportPdf({ records, kind, municipality, filterSummary = [], groupBy = 'none', layout = 'table', generatedAt = new Date() }) {
  const [{ jsPDF }, tableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = typeof tableModule.default === 'function' ? tableModule.default : tableModule.default.default;
  const demands = kind === 'demands';
  const title = demands ? 'Ordens de serviço' : 'Solicitações da cidade';
  const doc = new jsPDF({ orientation: layout === 'table' ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = width - margin * 2;
  const red = [182, 23, 34];
  const ink = [30, 41, 59];
  const muted = [100, 116, 139];
  const city = [municipality.cidade?.name, municipality.cidade?.states?.uf].filter(Boolean).join('/');
  const timestamp = generatedAt.toLocaleDateString('pt-BR') + ' às ' + generatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  doc.setProperties({ title: `${title} - ${municipality.nome}`, subject: 'Relatório de atendimento municipal', author: municipality.nome, creator: 'Trombone Cidadão' });
  let y = 31;
  const ensureSpace = (space = 16) => { if (y + space > height - 17) { doc.addPage(); y = 31; } };
  const table = (options) => {
    autoTable(doc, {
      margin: { left: margin, right: margin, top: 31, bottom: 17 }, startY: y,
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: ink, overflow: 'linebreak', lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: ink, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] }, rowPageBreak: 'avoid', showHead: 'everyPage',
      ...options,
    });
    y = doc.lastAutoTable.finalY + 5;
  };
  const heading = (value, size = 10) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(...ink);
    const lines = doc.splitTextToSize(pdfText(value), contentWidth);
    ensureSpace(lines.length * 4 + 12);
    doc.text(lines, margin, y); y += lines.length * 4 + 2;
  };

  const metrics = demands
    ? [['Ordens encontradas', records.length], ['Com prazo atrasado', records.filter((item) => item.overdue).length], ['Sem responsável', records.filter((item) => item.responsible === 'Sem responsável').length]]
    : [['Solicitações encontradas', records.length], ['Com ordem de serviço', records.filter((item) => item.orderReference !== 'Sem ordem').length], ['Há mais de 30 dias', records.filter((item) => item.age > 30).length]];
  metrics.forEach(([label, value], index) => {
    const x = margin + index * contentWidth / 3;
    doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(value.toLocaleString('pt-BR'), x, y + 5);
    doc.setTextColor(...muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(label, x, y + 11);
  });
  y += 19;
  const statuses = new Map();
  records.forEach((record) => statuses.set(record.status, (statuses.get(record.status) || 0) + 1));
  const hasDistribution = statuses.size > 1;
  const summaryStart = y;
  const distributionWidth = layout === 'table' && hasDistribution ? 65 : 0;
  const filterWidth = contentWidth - (distributionWidth ? distributionWidth + 8 : 0);
  const filterColumns = layout === 'table' && !hasDistribution ? 3 : 2;
  const relevantFilters = filterSummary.filter(([, value]) => String(value || '').trim() && !['Sem agrupamento', 'Todos os status', 'Todas as categorias', 'Todos os responsáveis', 'Todas as secretarias'].includes(value));
  if (relevantFilters.length) {
    heading('Filtros aplicados', 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted);
    for (let start = 0; start < relevantFilters.length; start += filterColumns) {
      const row = relevantFilters.slice(start, start + filterColumns).map(([label, value]) => doc.splitTextToSize(pdfText(`${label}: ${value}`), filterWidth / filterColumns - 6));
      const rowHeight = Math.max(...row.map((lines) => lines.length)) * 3.5 + 1.5;
      ensureSpace(rowHeight);
      const rowY = y;
      row.forEach((lines, index) => doc.text(lines, margin + index * filterWidth / filterColumns, rowY));
      y += rowHeight;
    }
    y += 3;
  }
  const filterEnd = y;
  if (hasDistribution) {
    const x = distributionWidth ? width - margin - distributionWidth : margin;
    const startY = distributionWidth ? summaryStart : y;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ink); doc.text('Distribuição por status', x, startY);
    autoTable(doc, { startY: startY + 3, tableWidth: distributionWidth || contentWidth, margin: { left: x, right: margin, top: 31, bottom: 17 }, head: [['Status', 'Quantidade']], body: [...statuses].map(([status, count]) => [pdfText(status), count.toLocaleString('pt-BR')]), styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.3, textColor: ink, overflow: 'linebreak' }, headStyles: { fillColor: [241, 245, 249], textColor: muted, fontStyle: 'bold' }, columnStyles: { 1: { cellWidth: 20, halign: 'right' } }, theme: 'plain', rowPageBreak: 'avoid' });
    y = Math.max(filterEnd, doc.lastAutoTable.finalY + 5);
  }

  for (const group of groupExportRecords(records, groupBy)) {
    heading(groupBy === 'none' ? 'Registros exportados' : `${group.name} (${group.rows.length.toLocaleString('pt-BR')})`);
    if (layout === 'details') {
      for (const item of group.rows) {
        ensureSpace(35);
        heading(`${demands ? item.reference : '#' + item.reference} | ${item.title}`, 10);
        const details = [
          ['Status / categoria', `${item.status} / ${item.category}${demands ? ' / Prioridade: ' + item.priority : ''}`],
          ['Endereço / bairro', `${item.address}\n${item.neighborhood}`],
          ['Secretaria / responsável', `${item.channel}\n${item.responsible}`],
          [demands ? 'Datas e prazos' : 'Publicação / idade', demands ? `Criada: ${date(item.createdAt)} | Prazo: ${date(item.dueAt)}${item.overdue ? ' (ATRASADA)' : ''}\nPrevisão: ${date(item.forecastAt)}` : `${date(item.createdAt)} | ${item.age ?? '-'} dias\nOrdem de serviço: ${item.orderReference}`],
        ];
        if (item.description) details.push(['Descrição', item.description]);
        if (item.nextAction) details.push(['Próxima ação', `${item.nextAction}\n${date(item.nextActionAt)}`]);
        if (item.review) details.push(['Revisão', 'Manifestação precisa de revisão']);
        table({ body: details.map((row) => row.map(pdfText)), columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' } } });
        if (demands && item.linkedLocations?.length) {
          heading(`Endereços das solicitações vinculadas (${item.linkedLocations.length})`, 9);
          table({ head: [['Solicitação', 'Endereço / bairro']], body: item.linkedLocations.map((location, index) => [pdfText(`${index + 1}. ${location.title}`), pdfText(`${location.address || 'Endereço não informado'}\n${location.neighborhood || 'Bairro não informado'}`)]), columnStyles: { 0: { cellWidth: contentWidth * 0.38 } } });
        }
      }
    } else {
      const headers = demands ? ['Protocolo', 'Serviço / categoria', 'Endereço / bairro', 'Secretaria / responsável', 'Status / prioridade', 'Prazo / previsão'] : ['ID', 'Solicitação / categoria', 'Endereço / bairro', 'Status', 'Publicação / idade', 'Ordem de serviço', 'Secretaria / responsável'];
      const widths = demands ? [30, 63, 46, 47, 45, 38] : [28, 65, 53, 31, 27, 26, 39];
      const pairs = group.rows.map((item) => demands
        ? [[item.reference, ''], [item.title, item.category], item.linkedLocations?.length ? [`${item.linkedLocations.length} ${item.linkedLocations.length === 1 ? 'local vinculado' : 'locais vinculados'}`, 'Endereços relacionados abaixo' + (item.serviceAddress ? '\nReferência: ' + item.serviceAddress : '')] : [item.address, item.neighborhood], [item.channel, item.responsible], [item.status, `${item.priority}${item.review ? '\nRevisão pendente' : ''}`], [date(item.dueAt) + (item.overdue ? ' · ATRASADA' : ''), 'Previsão: ' + date(item.forecastAt)]]
        : [[item.reference || item.id, ''], [item.title, item.category], [item.address, item.neighborhood], [item.status, ''], [date(item.createdAt), `${item.age ?? '-'} dias`], [item.orderReference, ''], [item.channel, item.responsible]]);
      const prepared = pairs.map((row) => row.map(([primary, secondary], index) => {
        doc.setFont('helvetica', index < 2 ? 'bold' : 'normal'); doc.setFontSize(8.2);
        const primaryLines = doc.splitTextToSize(pdfText(primary), widths[index] - 4);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.1);
        const secondaryLines = secondary ? doc.splitTextToSize(pdfText(secondary), widths[index] - 4) : [];
        return { primaryLines, secondaryLines, height: primaryLines.length * 3.4 + secondaryLines.length * 2.9 + 4 };
      }));
      table({
        head: [headers], body: pairs.map((row) => row.map(([primary, secondary]) => pdfText(primary + (secondary ? '\n' + secondary : '')))),
        columnStyles: Object.fromEntries(widths.map((cellWidth, index) => [index, { cellWidth }])),
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          data.cell.text = [];
          data.cell.styles.minCellHeight = prepared[data.row.index][data.column.index].height;
        },
        didDrawCell: (data) => {
          if (data.section !== 'body') return;
          const cell = prepared[data.row.index][data.column.index];
          doc.setFont('helvetica', data.column.index < 2 ? 'bold' : 'normal'); doc.setFontSize(8.2); doc.setTextColor(...(demands && data.column.index === 5 && group.rows[data.row.index].overdue ? red : ink));
          doc.text(cell.primaryLines, data.cell.x + 2, data.cell.y + 4.6);
          if (cell.secondaryLines.length) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7.1); doc.setTextColor(...muted);
            doc.text(cell.secondaryLines, data.cell.x + 2, data.cell.y + 4.6 + cell.primaryLines.length * 3.4);
          }
        },
      });
      if (demands && group.rows.some((item) => item.linkedLocations?.length)) {
        heading('Endereços das solicitações vinculadas', 10);
        // One row per location keeps large orders paginated without oversized summary cells.
        table({ head: [['Ordem de serviço', 'Solicitação', 'Endereço / bairro']],
          body: group.rows.flatMap((item) => (item.linkedLocations || []).map((location, index) => [pdfText(item.reference), pdfText(`${index + 1}. ${location.title}`), pdfText(`${location.address || 'Endereço não informado'}\n${location.neighborhood || 'Bairro não informado'}`)])),
          columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold' }, 1: { cellWidth: 78 } },
        });
      }
    }
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.saveGraphicsState();
    doc.setFillColor(...red); doc.rect(0, 0, width, 1.2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...red); doc.text('TROMBONE CIDADÃO / GESTÃO MUNICIPAL', margin, 8);
    doc.setTextColor(...ink); doc.setFontSize(14); doc.text(pdfText(title), margin, 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...muted);
    doc.text(pdfText([municipality.nome, city].filter(Boolean).join(' · ')), margin, 21, { maxWidth: contentWidth });
    doc.text(`Gerado em ${timestamp}`, width - margin, 8, { align: 'right' });
    doc.setDrawColor(226, 232, 240); doc.line(margin, 25, width - margin, 25);
    doc.line(margin, height - 13, width - margin, height - 13);
    doc.setFontSize(7); doc.text(`Gerado em ${timestamp} · ${records.length.toLocaleString('pt-BR')} registros`, margin, height - 8);
    doc.text(`Página ${page} de ${pages}`, width - margin, height - 8, { align: 'right' });
    doc.restoreGraphicsState();
  }
  return doc;
}

export async function downloadMunicipalExport(options) {
  const { records, kind, format, groupBy } = options;
  if (!records.length) throw new Error('Nenhum registro corresponde aos filtros escolhidos.');
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const filename = `${kind === 'demands' ? 'ordens-de-servico' : 'solicitacoes'}-${localDate}`;
  if (format === 'pdf') {
    const doc = await buildMunicipalExportPdf(options);
    doc.save(filename + '.pdf');
    return;
  }
  const url = URL.createObjectURL(new Blob([municipalExportCsv(records, kind, groupBy)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename + '.csv'; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
