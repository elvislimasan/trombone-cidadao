import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { pipaDateTime, pipaNumber, PIPA_PROVIDERS } from './pipa';

export async function exportPipaReport({ municipality, stats, period, provider, driverName, locality }) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(18); doc.text('Operação-pipa · Relatório privado', 14, 18);
  doc.setFontSize(10); doc.text(`${municipality || 'Gestão municipal'} | ${period.from} a ${period.to} | ${PIPA_PROVIDERS[provider] || 'Prefeitura e Exército'}`, 14, 26);
  doc.text(`Pipeiro: ${driverName || 'Todos'} | Localidade: ${locality || 'Todas'}`, 14, 33);
  doc.text(`${pipaNumber(stats.loads)} carradas | ${pipaNumber(stats.liters)} litros | ${stats.tanksServed} caixas atendidas`, 14, 40);
  autoTable(doc, { startY: 47, head: [['Pipeiro', 'Carradas', 'Litros', 'Caixas', 'Localidades']], body: stats.byDriver.filter(d => d.loads).map(d => [d.name, d.loads, pipaNumber(d.liters), d.tanks, d.localities.join(', ')]), styles: { fontSize: 9 } });
  doc.addPage(); doc.text('Abastecimentos por localidade', 14, 18);
  autoTable(doc, { startY: 24, head: [['Localidade', 'Carradas', 'Litros', 'Caixas']], body: stats.byLocality.map(row => [row.id, row.loads, pipaNumber(row.liters), row.tanks]), styles: { fontSize: 9 } });
  doc.addPage(); doc.text('Abastecimentos no período', 14, 18);
  autoTable(doc, { startY: 24, head: [['Entrega', 'Caixa / destino', 'Localidade', 'Pipeiro', 'Placa', 'Realizado por', 'Carradas', 'Litros', 'Registro']], body: stats.period.map(d => [pipaDateTime(d.delivered_at), d.destination_name, d.locality, d.driver_name, d.plate, PIPA_PROVIDERS[d.provider], d.loads, pipaNumber(d.liters), d.source === 'gps' ? 'GPS' : 'Manual']), styles: { fontSize: 8 } });
  const fileName = `operacao-pipa-${period.from}-${period.to}.pdf`;
  if (Capacitor.isNativePlatform()) {
    const { salvarDocumento, pdfParaBase64 } = await import('./nativeDownload');
    await salvarDocumento({ base64: pdfParaBase64(doc), fileName });
  } else doc.save(fileName);
}
