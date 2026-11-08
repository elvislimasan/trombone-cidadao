import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useElectricianOffline } from '@/contexts/ElectricianOfflineContext';
import { retryElectricianJob } from '@/lib/electricianOffline';

export default function ElectricianOfflineStatus({ userId, municipalityId }) {
  const { jobs, syncing, sync, online } = useElectricianOffline();
  const [message, setMessage] = useState('');
  const pending = jobs.filter(job => job.municipalityId === municipalityId && job.state !== 'sent');
  const download = async (job) => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('registro.json', JSON.stringify({ ...job, photos: job.photos.map(({ blob, ...photo }) => photo) }, null, 2));
    for (const [index, photo] of job.photos.entries()) zip.file(`foto-${index}-${photo.name}`, photo.blob);
    const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
    const link = document.createElement('a'); link.href = url; link.download = `atendimento-${job.id}.zip`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  if (!pending.length) return null;
  return <details className="page-shell-fluid border-b border-edge-subtle bg-surface-subtle py-3 text-sm" open>
    <summary className="cursor-pointer font-semibold" role="status">{syncing ? 'Enviando registros…' : `${pending.length} registro(s) aguardando envio`}</summary>
    <div className="mt-3 space-y-3">
      <p className="text-xs text-content-secondary">Registros e fotos serão enviados automaticamente quando houver conexão e o aplicativo estiver aberto.</p>
      <Button size="sm" disabled={!online || syncing} onClick={sync}>Enviar agora</Button>
      {message && <p role="status" className="text-xs">{message}</p>}
      {pending.length > 0 && <ul className="space-y-2">{pending.map(job => <li key={job.id} className="rounded-lg border border-edge-subtle p-3 text-xs"><strong>{job.label || 'Atendimento'}</strong><p>{job.state === 'blocked' ? `Precisa de revisão: ${job.error}` : job.error || 'Guardado. Aguardando conexão para confirmar no servidor.'}</p>{job.state === 'blocked' && <p className="mt-1">Os dados e fotos continuam guardados. Confira a ordem e as permissões antes de tentar novamente.</p>}<div className="mt-2 flex flex-wrap gap-2">{job.state === 'blocked' && <Button size="sm" variant="outline" disabled={!online || syncing} onClick={async () => { await retryElectricianJob(userId, job.id); await sync(); }}>Tentar novamente</Button>}<Button size="sm" variant="ghost" onClick={() => download(job).catch(error => setMessage(error.message))}>Baixar cópia com fotos</Button></div></li>)}</ul>}
    </div>
  </details>;
}
