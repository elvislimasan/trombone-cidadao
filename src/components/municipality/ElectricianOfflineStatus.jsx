import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useElectricianOffline } from '@/contexts/ElectricianOfflineContext';
import { cachedElectricianOrders, prepareElectricianOrders, retryElectricianJob } from '@/lib/electricianOffline';

export default function ElectricianOfflineStatus({ userId, municipalityId, cityId }) {
  const { jobs, syncing, sync, online } = useElectricianOffline();
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState('');
  const [orders, setOrders] = useState([]);
  const pending = jobs.filter(job => job.municipalityId === municipalityId && job.state !== 'sent');
  useEffect(() => { let active = true; cachedElectricianOrders(userId, municipalityId).then(rows => { if (active) setOrders(rows); }); return () => { active = false; }; }, [userId, municipalityId, preparing, online]);
  const prepare = async () => {
    setPreparing(true); setMessage('Preparando ordens…');
    try {
      await navigator.storage?.persist?.();
      await Promise.all([import('@/pages/ElectricianOrderPage'), import('@/components/municipality/ElectricianLightingMap'), import('@/pages/ElectricianPatrolPage')]);
      const count = await prepareElectricianOrders(supabase, userId, municipalityId, n => setMessage(`${n} ordem(ns) preparada(s)…`), cityId);
      setMessage(`${count} ordem(ns) disponível(is) neste aparelho, com solicitações e dados dos postes.`);
    } catch (error) { setMessage(error.message); }
    finally { setPreparing(false); }
  };
  const download = async (job) => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('registro.json', JSON.stringify({ ...job, photos: job.photos.map(({ blob, ...photo }) => photo) }, null, 2));
    for (const [index, photo] of job.photos.entries()) zip.file(`foto-${index}-${photo.name}`, photo.blob);
    const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
    const link = document.createElement('a'); link.href = url; link.download = `atendimento-${job.id}.zip`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return <details className="page-shell-fluid border-b border-edge-subtle bg-surface-subtle py-3 text-sm" open={!online || pending.length > 0 || undefined}>
    <summary className="cursor-pointer font-semibold" role="status">{syncing && pending.length ? 'Enviando registros…' : pending.length ? `${pending.length} registro(s) aguardando envio` : online ? 'Trabalho sem internet · preparar aparelho' : 'Sem internet · registros salvos neste aparelho'}</summary>
    <div className="mt-3 space-y-3">
      <p className="text-xs text-content-secondary">Prepare as ordens antes de sair. Registros e fotos serão enviados automaticamente quando houver conexão e o aplicativo estiver aberto. Mantenha sua conta conectada. O mapa de fundo e rotas externas podem precisar de internet.</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!online || preparing} onClick={prepare}>{preparing ? 'Preparando…' : 'Preparar ordens e postes'}</Button>{pending.length > 0 && <Button size="sm" disabled={!online || syncing} onClick={sync}>Enviar agora</Button>}</div>
      {message && <p role="status" className="text-xs">{message}</p>}
      {orders.length > 0 && <details><summary className="cursor-pointer text-xs font-semibold">Ordens guardadas neste aparelho ({orders.length})</summary><ul className="mt-2 space-y-2">{orders.map(order => <li key={order.id}><Link className="text-xs text-brand underline" to={`/prefeitura/eletricista/ordem/${order.id}`}>{order.protocolo || order.titulo}</Link></li>)}</ul></details>}
      {pending.length > 0 && <ul className="space-y-2">{pending.map(job => <li key={job.id} className="rounded-lg border border-edge-subtle p-3 text-xs"><strong>{job.label || 'Atendimento'}</strong><p>{job.state === 'blocked' ? `Precisa de revisão: ${job.error}` : job.error || 'Guardado. Aguardando conexão para confirmar no servidor.'}</p>{job.state === 'blocked' && <p className="mt-1">Os dados e fotos continuam guardados. Confira a ordem e as permissões antes de tentar novamente.</p>}<div className="mt-2 flex flex-wrap gap-2">{job.state === 'blocked' && <Button size="sm" variant="outline" disabled={!online || syncing} onClick={async () => { await retryElectricianJob(userId, job.id); await sync(); }}>Tentar novamente</Button>}<Button size="sm" variant="ghost" onClick={() => download(job).catch(error => setMessage(error.message))}>Baixar cópia com fotos</Button></div></li>)}</ul>}
    </div>
  </details>;
}
