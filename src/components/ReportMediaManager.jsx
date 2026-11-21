import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useUpload } from '@/contexts/UploadContext';
import { REPORT_PHOTO_ACCEPT } from '@/lib/reportPhoto';

const statusLabel = { pending: 'Na fila', preparing: 'Preparando', uploading: 'Enviando', finalizing: 'Salvando', completed: 'Enviado', error: 'Pendente' };

export default function ReportMediaManager() {
  const { activeUploads, reports, storageError, managerOpen, managedReportId, closeMediaManager, selectManagedReport, queueReportMedia, retryUpload, replaceUpload, cancelUpload } = useUpload();
  const report = reports.find(item => item.reportId === managedReportId);
  const items = Object.values(activeUploads).filter(item => !managedReportId || item.reportId === managedReportId);
  const gallery = useRef(null), camera = useRef(null), replacement = useRef(null);
  const [replacingId, setReplacingId] = useState(null);
  const [inputError, setInputError] = useState('');
  const addFiles = async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    setInputError('');
    if (!report) return;
    try {
      for (const file of files) await queueReportMedia({ file, name: file.name, type: 'photo' }, report);
    } catch { setInputError('Não foi possível adicionar a foto. Tente novamente.'); }
  };
  const replaceFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !replacingId) return;
    try { await replaceUpload(replacingId, { file, name: file.name, type: 'photo' }); }
    catch { setInputError('Não foi possível trocar a foto. Tente novamente.'); }
    setReplacingId(null);
  };
  return <Dialog open={managerOpen} onOpenChange={open => { if (!open) closeMediaManager(); }}>
    {/* Apenas o diálogo tem largura de formulário; o layout da página continua fluido. */}
    <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl flex-col gap-4 overflow-hidden rounded-2xl p-5">
      <DialogTitle>Imagens da bronca</DialogTitle>
      <DialogDescription className="sr-only">Gerencie imagens e arquivos pendentes.</DialogDescription>
      <input ref={gallery} type="file" accept={REPORT_PHOTO_ACCEPT} multiple onChange={addFiles} className="hidden" aria-label="Selecionar novas fotos" />
      <input ref={camera} type="file" accept={REPORT_PHOTO_ACCEPT} capture="environment" onChange={addFiles} className="hidden" aria-label="Tirar nova foto" />
      <input ref={replacement} type="file" accept={REPORT_PHOTO_ACCEPT} onChange={replaceFile} className="hidden" aria-label="Substituir arquivo pendente" />
      {storageError && <p role="alert" className="text-sm text-destructive">O aparelho não permitiu guardar os arquivos. Mantenha esta página aberta para reenviar.</p>}
      {inputError && <p role="alert" className="text-sm text-destructive">{inputError}</p>}
      {report ? <>
        <div className="min-w-0">
          <button className="min-h-10 text-sm font-semibold text-brand" onClick={() => selectManagedReport(null)}>Todos os envios</button>
          <p className="font-semibold break-words">{report.title || 'Bronca registrada'}</p>
          {report.protocol && <p className="text-xs text-muted-foreground">{report.protocol}</p>}
          {report.anonymous && <p className="mt-1 text-xs text-muted-foreground">Reenvio anônimo disponível neste aparelho por 7 dias após o registro.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => gallery.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />Adicionar fotos</Button>
          <Button variant="outline" onClick={() => camera.current?.click()}>Tirar foto</Button>
        </div>
      </> : <div className="max-h-40 overflow-y-auto space-y-2">
        {reports.map(item => <button key={item.reportId} onClick={() => selectManagedReport(item.reportId)} className="block w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold hover:bg-accent">{item.title || item.protocol || 'Bronca registrada'}</button>)}
      </div>}
      <div className="min-h-0 flex-1 overflow-y-auto space-y-3" aria-live="polite">
        {items.length === 0 && <p className="text-sm text-muted-foreground">{report ? 'Nenhum arquivo pendente.' : 'Selecione uma bronca para adicionar fotos.'}</p>}
        {items.map(item => <div key={item.id} className="rounded-xl border p-3">
          <div className="flex items-center gap-2">
            {item.status === 'completed' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" /> : item.status === 'error' ? <AlertCircle className="h-4 w-4 shrink-0 text-destructive" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</p>
            <span className="text-xs text-muted-foreground">{statusLabel[item.status] || 'Enviando'}</span>
          </div>
          {!['error', 'completed'].includes(item.status) && <Progress value={item.progress} className="mt-2 h-1.5" />}
          {item.status === 'error' && <>
            <p className="mt-2 text-xs text-destructive">{item.error}</p>
            <p className="mt-1 text-xs text-muted-foreground">A bronca está salva.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => retryUpload(item.id)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Reenviar</Button>
              <Button size="sm" variant="outline" onClick={() => { setReplacingId(item.id); replacement.current?.click(); }}>Trocar imagem</Button>
              <Button size="sm" variant="ghost" onClick={() => cancelUpload(item.id)}>Remover pendência</Button>
              {!report && <Button size="sm" variant="ghost" onClick={() => selectManagedReport(item.reportId)}>Adicionar fotos</Button>}
            </div>
          </>}
          {!['error', 'completed'].includes(item.status) && <Button size="sm" variant="ghost" className="mt-1" onClick={() => cancelUpload(item.id)}>Interromper</Button>}
        </div>)}
      </div>
    </DialogContent>
  </Dialog>;
}
