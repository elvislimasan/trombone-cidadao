import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { receiptCategory, receiptProblemFields } from '@/lib/reportReceiptDetails';

export default function ReportReceipt({ report, onClose, imageStatus = '' }) {
  if (!report) return null;
  const municipal = Boolean(report.created_by_municipality);
  const date = report.created_at && Number.isFinite(new Date(report.created_at).getTime())
    ? new Date(report.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null;
  const details = [
    { label: 'Solicitação', value: report.title || 'Não informada' },
    { label: 'Categoria', value: receiptCategory(report) },
    ...receiptProblemFields(report),
    ...(report.address ? [{ label: 'Endereço', value: report.address }] : []),
    ...(date ? [{ label: 'Registrada em', value: date }] : []),
  ];

  // A largura de recibo limita apenas a folha interna, não o layout da página.
  return createPortal(<div className="receipt-overlay pointer-events-auto fixed inset-0 z-[11000] flex items-center justify-center overflow-y-auto bg-black/70 p-2 touch-pan-y sm:p-5" role="dialog" aria-modal="true" aria-label="Comprovante da solicitação">
    <style>{`@media print {
      @page { size: A4; margin: 13mm; }
      body * { visibility: hidden !important; }
      .receipt-overlay { position: static !important; display: block !important; overflow: visible !important; padding: 0 !important; background: none !important; }
      #report-receipt, #report-receipt * { visibility: visible !important; }
      #report-receipt { position: absolute !important; top: 0 !important; left: 0 !important; width: 110mm !important; max-width: none !important; max-height: none !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
      #report-receipt .receipt-actions { display: none !important; }
      #report-receipt, #report-receipt * { color: #000 !important; background: #fff !important; }
    }`}</style>
    <article id="report-receipt" className="max-h-[calc(100dvh-16px)] w-full max-w-[520px] overflow-y-auto overscroll-contain bg-white p-5 text-black shadow-2xl sm:max-h-[calc(100dvh-40px)] sm:p-8">
      <header className="flex items-start justify-between gap-3 border-b border-black pb-4">
        <h2 className="text-base font-bold uppercase tracking-wide">Comprovante de solicitação</h2>
        <button type="button" onClick={onClose} aria-label="Fechar comprovante" className="receipt-actions -mr-2 -mt-2 rounded-full p-2 hover:bg-gray-100"><X size={19} /></button>
      </header>
      <div className="border-b border-dashed border-black py-5">
        <span className="block text-xs font-semibold uppercase">Protocolo</span>
        <strong className="mt-1 block break-all text-xl leading-tight sm:text-2xl">{report.protocol || 'Não informado'}</strong>
      </div>
      <dl className="divide-y divide-gray-300 border-b border-dashed border-black">
        {details.map(({ label, value }) => <div key={label} className="py-3">
          <dt className="text-xs font-semibold uppercase">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value}</dd>
        </div>)}
      </dl>
      {imageStatus && <p role={imageStatus === 'error' ? 'alert' : 'status'} className="receipt-actions mt-4 text-xs">
        {imageStatus === 'saving' ? 'Salvando o PDF do comprovante em Arquivos…' : imageStatus === 'saved' ? 'PDF do comprovante salvo em Arquivos.' : 'Não foi possível salvar o PDF. Abra Arquivos para tentar novamente.'}
      </p>}
      <div className="receipt-actions mt-6 flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{municipal ? 'Ver no painel' : 'Fechar'}</Button><Button type="button" variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir</Button></div>
    </article>
  </div>, document.body);
}
