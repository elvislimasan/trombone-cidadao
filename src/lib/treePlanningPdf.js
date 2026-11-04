import { treePlanningRows } from './treePlanning.js';

const GREEN = [8, 127, 91];
const BLUE = [37, 99, 235];
const GRAY = [100, 116, 139];
const number = value => Number(value || 0).toLocaleString('pt-BR');

export async function buildTreePlanningPdf({ trees, cities = [], cityName = '', scope = '', now = new Date() }) {
  const rows = treePlanningRows(trees);
  if (!rows.length) throw new Error('Nenhum plantio com ano previsto para exportar.');
  const [{ jsPDF }, tableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = tableModule.autoTable || (typeof tableModule.default === 'function' ? tableModule.default : tableModule.default?.default);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 14;
  let y = 0;
  const title = 'Planejamento anual de arborização';
  doc.setProperties({ title, subject: cityName || 'Planejamento de arborização', creator: 'Trombone Cidadão' });
  const header = () => {
    doc.setFillColor(...GREEN); doc.rect(0, 0, width, 3, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(20, 30, 40); doc.text(title, margin, 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
    const description = [cityName || 'Cidades selecionadas', scope].filter(Boolean).join(' | ');
    const lines = doc.splitTextToSize(description, width - margin * 2);
    doc.text(lines, margin, 22); y = 25 + lines.length * 4;
  };
  const space = amount => { if (y + amount > height - 16) { doc.addPage(); header(); } };
  header();
  const totals = rows.reduce((sum, row) => ({ total: sum.total + row.total, planned: sum.planned + row.planned, planted: sum.planted + row.planted, unconfirmed: sum.unconfirmed + row.unconfirmed }), { total: 0, planned: 0, planted: 0, unconfirmed: 0 });
  const cardWidth = (width - margin * 2 - 12) / 4;
  [['Total previsto', totals.total], ['Pendentes', totals.planned], ['Realizados do plano', totals.planted], ['Sem confirmação', totals.unconfirmed]].forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + 4);
    doc.setFillColor(240, 247, 244); doc.roundedRect(x, y, cardWidth, 20, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...GREEN); doc.text(number(value), x + 4, y + 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 60, 70); doc.text(label, x + 4, y + 16);
  });
  y += 30;
  const chart = (heading, entries, limit = Infinity) => {
    const groups = new Map();
    for (const row of rows) {
      const key = entries(row);
      const item = groups.get(key) || { name: key, total: 0, planned: 0, planted: 0, unconfirmed: 0 };
      for (const field of ['total', 'planned', 'planted', 'unconfirmed']) item[field] += row[field];
      groups.set(key, item);
    }
    const data = [...groups.values()].sort((a, b) => limit === Infinity ? a.name.localeCompare(b.name, 'pt-BR', { numeric: true }) : b.total - a.total || a.name.localeCompare(b.name, 'pt-BR')).slice(0, limit);
    const max = Math.max(1, ...data.map(row => row.total));
    space(28); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(25, 35, 45); doc.text(heading, margin, y); y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    let legendX = margin;
    for (const [label, color] of [['Pendentes', BLUE], ['Realizados', GREEN], ['Sem confirmação', GRAY]]) { doc.setFillColor(...color); doc.rect(legendX, y - 2.5, 3, 3, 'F'); doc.setTextColor(...GRAY); doc.text(label, legendX + 5, y); legendX += 45; }
    y += 8;
    for (const row of data) {
      space(15);
      doc.setTextColor(40, 50, 60); doc.setFontSize(8);
      const label = doc.splitTextToSize(row.name, 70).slice(0, 2);
      doc.text(label, margin, y + 3);
      let x = margin + 74;
      const barWidth = width - margin * 2 - 90;
      for (const [field, color] of [['planned', BLUE], ['planted', GREEN], ['unconfirmed', GRAY]]) {
        const size = row[field] / max * barWidth;
        if (size > 0) { doc.setFillColor(...color); doc.rect(x, y, size, 5, 'F'); x += size; }
      }
      doc.setTextColor(40, 50, 60); doc.text(number(row.total), x + 3, y + 4); y += 12;
    }
    y += 8;
  };
  chart('Planejamento por ano previsto', row => String(row.year));
  const multiCity = new Set(rows.map(row => String(row.city_id))).size > 1;
  const citySuffix = row => multiCity ? ` - ${cities.find(city => String(city.id) === String(row.city_id))?.name || row.city_id}` : '';
  chart('Bairros com maior quantidade prevista (até 10)', row => `${row.neighborhood}${citySuffix(row)}`, 10);
  chart('Ruas com maior quantidade prevista (até 10)', row => `${row.street} - ${row.neighborhood}${citySuffix(row)}`, 10);
  space(22); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(25, 35, 45); doc.text('Detalhamento por ano, bairro e rua', margin, y); y += 6;
  autoTable(doc, { startY: y, margin: { left: margin, right: margin, top: 46, bottom: 18 },
    head: [['Ano', 'Cidade', 'Bairro', 'Rua', 'Total previsto', 'Pendentes', 'Realizados', 'Sem confirmação']],
    body: rows.map(row => [row.year, cities.find(city => String(city.id) === String(row.city_id))?.name || row.city_id, row.neighborhood, row.street, row.total, row.planned, row.planted, row.unconfirmed]),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, overflow: 'linebreak' }, headStyles: { fillColor: GREEN }, alternateRowStyles: { fillColor: [246, 249, 247] },
    didDrawPage: data => { if (data.pageNumber > 1) header(); },
  });
  y = doc.lastAutoTable.finalY + 8; space(20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
  doc.text(doc.splitTextToSize('O ano é a previsão original. Realizados correspondem a árvores desse planejamento com data de plantio confirmada, mesmo quando executadas em outro ano. Árvores existentes sem ano previsto não compõem este relatório.', width - margin * 2), margin, y);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text(`Trombone Cidadão | Gerado em ${now.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}`, margin, height - 7);
    doc.text(`${page} / ${pages}`, width - margin, height - 7, { align: 'right' });
  }
  return doc;
}

export async function downloadTreePlanningPdf(options) {
  const doc = await buildTreePlanningPdf(options);
  const fileName = `planejamento-arborizacao-${new Date().toISOString().slice(0, 10)}.pdf`;
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    const { pdfParaBase64, salvarDocumento } = await import('./nativeDownload');
    await salvarDocumento({ base64: pdfParaBase64(doc), fileName, contentType: 'application/pdf', tituloShare: 'Planejamento de arborização' });
  } else doc.save(fileName);
}
