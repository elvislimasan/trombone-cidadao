import React, { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { useUpload } from '@/contexts/UploadContext';

const notificationKey = item => item.status === 'error'
  ? `${item.id}:error:${item.lastUpdate || item.timestamp || ''}`
  : `${item.id}:active`;

export default function ReportUploadIndicator() {
  const { activeUploads, totalProgress, showMediaManager } = useUpload();
  const [hiddenNotifications, setHiddenNotifications] = useState(() => new Set());
  const pending = Object.values(activeUploads).filter(item => item.status !== 'completed');
  const failed = pending.filter(item => item.status === 'error').length;
  if (!pending.some(item => !hiddenNotifications.has(notificationKey(item)))) return null;

  // Fechar oculta o aviso atual; o transporte e os arquivos locais continuam.
  // Novos arquivos ou novas falhas voltam a mostrar o indicador.
  const hideIndicator = () => setHiddenNotifications(current => new Set([...current, ...pending.map(notificationKey)]));
  return <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-[1200] flex max-w-[calc(100vw-2rem)] items-stretch overflow-hidden rounded-xl border bg-background text-sm font-semibold shadow-lg lg:bottom-6">
    <button type="button" onClick={() => showMediaManager()} className="flex min-h-12 min-w-0 items-center gap-2 px-3 py-2" aria-label="Gerenciar imagens das broncas">
      {failed ? <AlertCircle className="h-5 w-5 shrink-0 text-destructive" /> : <Loader2 className="h-5 w-5 shrink-0 animate-spin" />}
      <span role="status">{failed ? `${failed} ${failed === 1 ? 'arquivo pendente' : 'arquivos pendentes'}` : `Enviando: ${Math.round(totalProgress)}%`}</span>
    </button>
    <button type="button" onClick={hideIndicator} className="flex min-h-12 w-12 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Ocultar indicador de imagens" title="Ocultar aviso">
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  </div>;
}
