import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ArrowRight, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import TimeAgo from '@/components/TimeAgo';

export default function PersonalUpdates({ compact = false }) {
  const { user } = useAuth();
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const [state, setState] = useState({ owner: null, items: [], loading: true, error: false });
  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!user?.id) return;
    setState(previous => ({ owner: user.id, items: previous.owner === user.id ? previous.items : [], loading: true, error: false }));
    try {
      // A consulta da central independe da permissão de push e usa somente a conta atual.
      const { data, error } = await supabase.from('notifications')
        .select('id, report_id, message, created_at').eq('user_id', user.id)
        .eq('is_read', false).not('report_id', 'is', null).neq('type', 'moderation_required')
        .order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      if (generation.current === request) setState({ owner: user.id, items: data || [], loading: false, error: false });
    } catch {
      if (generation.current === request) setState(previous => ({ ...previous, loading: false, error: true }));
    }
  }, [user?.id]);
  useEffect(() => {
    load();
    window.addEventListener('new-notification', load);
    window.addEventListener('focus', load);
    return () => { invalidate(); window.removeEventListener('new-notification', load); window.removeEventListener('focus', load); };
  }, [invalidate, load]);
  if (!user) return null;
  const current = state.owner === user.id ? state : { items: [], loading: true, error: false };
  if (compact) return current.items.length ? <Link to="/seguindo?aba=novidades" className="personal-updates-compact"><Bell size={20} aria-hidden="true" />Há novidades nas suas broncas<ArrowRight size={18} aria-hidden="true" /></Link> : null;
  return <section className="personal-updates" aria-label="Novidades para você">
    <div className="personal-updates-heading"><div><h2>Novidades para você</h2><p>Atualizações de broncas recebidas pela sua conta.</p></div><button type="button" onClick={load} disabled={current.loading} aria-label="Atualizar novidades"><RefreshCw size={18} aria-hidden="true" /></button></div>
    {current.error && <div role="alert" className="personal-list-state"><p>Não foi possível carregar suas novidades.</p><button type="button" onClick={load}>Tentar novamente</button></div>}
    {current.loading && !current.items.length ? <div role="status" className="personal-list-state"><p>Buscando novidades…</p><div className="personal-update-skeleton" /><div className="personal-update-skeleton" /></div>
      : !current.error && !current.items.length ? <div className="personal-list-state"><span className="personal-empty-icon"><Bell size={26} aria-hidden="true" /></span><h3>Tudo em dia por aqui</h3><p>Quando uma bronca tiver uma atualização para você, ela aparecerá nesta área.</p><Link to="/seguindo?aba=broncas">Ver broncas salvas<ArrowRight size={16} aria-hidden="true" /></Link></div>
        : <div className="personal-updates-list">{current.items.map(item => <Link key={item.id} to={`/bronca/${item.report_id}`} onClick={() => {
          supabase.from('notifications').update({ is_read: true }).eq('id', item.id).eq('user_id', user.id).then(() => {}, () => {});
        }}><span className="personal-update-icon"><Bell size={18} aria-hidden="true" /></span><span className="personal-update-copy"><strong>{item.message || 'Uma bronca teve atualização. Veja o andamento.'}</strong><TimeAgo date={item.created_at} /></span><ArrowRight size={18} aria-hidden="true" /></Link>)}</div>}
    {!!current.items.length && <p className="personal-updates-footnote">Até 20 novidades ainda não lidas. Salvar uma bronca e receber notificações são ações distintas.</p>}
  </section>;
}
