import React from 'react';
import { AlertCircle, ImagePlus, Loader2 } from 'lucide-react';
import { useUpload } from '@/contexts/UploadContext';

export default function ReportUploadIndicator() {
  const { activeUploads, reports, isUploading, totalProgress, showMediaManager } = useUpload();
  const failed = Object.values(activeUploads).filter(item => item.status === 'error').length;
  const anonymousRecovery = reports.some(item => item.anonymous && Number(String(item.recoveryToken || '').split('.')[0]) > Date.now());
  if (!reports.length || (!failed && !isUploading && !anonymousRecovery)) return null;
  return <button type="button" onClick={() => showMediaManager()} className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-[1200] flex min-h-12 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-semibold shadow-lg lg:bottom-6" aria-label="Gerenciar imagens das broncas">
    {failed ? <AlertCircle className="h-5 w-5 text-destructive" /> : isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
    <span role="status">{failed ? `${failed} ${failed === 1 ? 'arquivo pendente' : 'arquivos pendentes'}` : isUploading ? `Enviando: ${Math.round(totalProgress)}%` : 'Imagens das broncas'}</span>
  </button>;
}
