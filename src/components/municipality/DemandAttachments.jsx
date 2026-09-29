import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

export default function DemandAttachments({ files = [], publicView = false }) {
  const [urls, setUrls] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!files.length) { setUrls({}); return undefined; }
    let active = true;
    setUrls({}); setError('');
    supabase.storage.from('municipal-demand-files').createSignedUrls(files.map((file) => file.storage_path), 3600)
      .then(({ data, error: failure }) => {
        if (!active) return;
        if (failure || data?.some((item) => item.error)) setError('Não foi possível carregar todos os anexos. Reabra o atendimento para tentar novamente.');
        setUrls(Object.fromEntries((data || []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl])));
      }).catch(() => { if (active) setError('Não foi possível carregar os anexos.'); });
    return () => { active = false; };
  }, [files]);
  if (!files.length) return null;
  return <div className="space-y-3">
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">{files.map((file) => <div key={file.id || file.storage_path} className="min-w-0 overflow-hidden rounded-xl border border-edge-subtle bg-surface-subtle">
      {urls[file.storage_path] ? <a href={urls[file.storage_path]} target="_blank" rel="noopener noreferrer" className="block hover:text-brand">
        {file.mime_type?.startsWith('image/') ? <img src={urls[file.storage_path]} alt={file.nome} loading="lazy" className="aspect-[4/3] w-full object-cover" /> : <FileText className="m-4 h-8 w-8 text-brand" />}
        <span className="block break-words p-3 text-xs font-semibold">{file.nome}</span>
      </a> : <p className="flex items-center gap-2 p-3 text-xs">{error ? <FileText className="h-4 w-4 shrink-0" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}{file.nome}{error && ' · Indisponível'}</p>}
      {!publicView && file.visibilidade && <p className="px-3 pb-3 text-[11px] text-content-secondary">{file.visibilidade === 'publica' ? 'Compartilhado na bronca pública' : 'Somente equipe municipal'}</p>}
    </div>)}</div>
  </div>;
}
