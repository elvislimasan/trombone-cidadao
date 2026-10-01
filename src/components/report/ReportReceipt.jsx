import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ReceiptMap, { receiptPoint } from './ReceiptMap';
import { receiptCategory, receiptProblemFields } from '@/lib/reportReceiptDetails';

export default function ReportReceipt({ report, onClose, imageStatus = '' }) {
  if (!report) return null;
  const point = receiptPoint(report.location);
  const municipal = Boolean(report.created_by_municipality);
  const internal = municipal && report.is_public === false;
  const date = report.created_at && Number.isFinite(new Date(report.created_at).getTime())
    ? new Date(report.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : 'Não informada';
  const reportUrl = report.id && !internal ? `${window.location.origin}/bronca/${report.id}` : null;

  // O comprovante é uma folha de leitura/impressão; o limite de 700 px vale só para esta coluna interna.
  return createPortal(<div className="receipt-overlay pointer-events-auto fixed inset-0 z-[11000] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-2 touch-pan-y sm:p-5" role="dialog" aria-modal="true" aria-label="Comprovante da solicitação">
    <style>{`@media print {
      @page { size: A4; margin: 13mm; }
      body * { visibility: hidden !important; }
      .receipt-overlay { position: static !important; display: block !important; overflow: visible !important; padding: 0 !important; background: none !important; }
      #report-receipt, #report-receipt * { visibility: visible !important; }
      #report-receipt { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; border-radius: 0 !important; box-shadow: none !important; }
      #report-receipt .receipt-print-content { padding: 0 !important; }
      #report-receipt .receipt-actions { display: none !important; }
      #report-receipt [aria-label="Localização da solicitação"] { break-inside: avoid; page-break-inside: avoid; }
      #report-receipt, #report-receipt * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }`}</style>
    <article id="report-receipt" className="max-h-[calc(100dvh-16px)] w-full max-w-[700px] overflow-y-auto overscroll-contain rounded-2xl bg-white text-slate-900 shadow-2xl sm:max-h-[calc(100dvh-40px)]">
      <div className="h-2 bg-red-700" />
      <div className="receipt-print-content p-5 sm:p-9">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3"><img src="/logo.png" alt="" className="h-12 w-12 object-contain" /><div><strong className="block text-lg leading-tight">Trombone Cidadão</strong><span className="mt-1 block text-[11px] font-semibold uppercase tracking-widest text-slate-500">{municipal ? 'Painel da Prefeitura' : 'Sua voz na cidade'}</span></div></div>
          <button type="button" onClick={onClose} aria-label="Fechar comprovante" className="receipt-actions rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button>
        </header>
        <p className="mt-7 text-[11px] font-extrabold uppercase tracking-widest text-red-700">Comprovante de solicitação de serviço</p>
        <h2 className="mt-2 text-2xl font-extrabold">Solicitação registrada</h2>
        <p className="mt-2 text-sm text-slate-500">{internal ? 'Registro interno da prefeitura, sem moderação e sem publicação no mapa público.' : 'Guarde este comprovante para acompanhar o andamento da solicitação.'}</p>
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4"><span className="block text-[10px] font-extrabold uppercase tracking-widest text-red-800">Número do protocolo</span><strong className="mt-1 block break-all text-2xl tracking-wide text-red-800">{report.protocol || 'Não informado'}</strong></div>
        <dl className="mt-6 grid grid-cols-2 gap-x-7 gap-y-5 text-sm"><div className="col-span-2"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Solicitação</dt><dd className="mt-1 break-words font-semibold">{report.title || 'Não informada'}</dd></div><div><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Categoria</dt><dd className="mt-1 break-words font-semibold">{receiptCategory(report)}</dd></div>{receiptProblemFields(report).map(({ label, value }) => <div key={label}><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>)}<div className="col-span-2"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Descrição do problema</dt><dd className="mt-1 whitespace-pre-wrap break-words font-semibold">{report.description || 'Não informada'}</dd></div><div className="col-span-2"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Endereço informado</dt><dd className="mt-1 break-words font-semibold">{report.address || 'Não informado'}</dd></div><div><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Registrada em</dt><dd className="mt-1 font-semibold">{date}</dd></div><div><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Visibilidade</dt><dd className="mt-1 font-semibold">{internal ? 'Apenas prefeitura' : 'Pública'}</dd></div></dl>
        {point && <section aria-label="Localização da solicitação" className="mt-7"><h3 className="mb-3 text-sm font-extrabold">Localização no mapa</h3><ReceiptMap point={point} /></section>}
        <footer className="mt-6 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500"><p>Acompanhe pelo número do protocolo.{point && <><br />Coordenadas: {point.lat.toFixed(5)}, {point.lng.toFixed(5)}</>}</p>{reportUrl && <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="max-w-full break-all font-semibold text-red-700">{reportUrl}</a>}</footer>
        {imageStatus && <p role={imageStatus === 'error' ? 'alert' : 'status'} className={`receipt-actions mt-4 text-xs ${imageStatus === 'error' ? 'text-red-700' : 'text-slate-500'}`}>
          {imageStatus === 'saving' ? 'Salvando o PDF do comprovante em Arquivos…' : imageStatus === 'saved' ? 'PDF do comprovante salvo em Arquivos.' : 'Não foi possível salvar o PDF. Abra Arquivos para tentar novamente.'}
        </p>}
        <div className="receipt-actions mt-6 flex justify-end gap-2"><Button type="button" variant={municipal ? 'default' : 'outline'} onClick={onClose}>{municipal ? 'Ver no painel' : 'Fechar'}</Button><Button type="button" variant={municipal ? 'outline' : 'default'} onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir comprovante</Button></div>
      </div>
    </article>
  </div>, document.body);
}
