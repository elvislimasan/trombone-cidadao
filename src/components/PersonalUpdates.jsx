import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ArrowRight, CheckCircle, FileText, Send } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { supabase } from '@/lib/customSupabaseClient';
import TimeAgo from '@/components/TimeAgo';

export default function PersonalUpdates({ compact = false }) {
  const { user } = useAuth();
  const { notificationsEnabled } = useNotifications();
  const [items, setItems] = useState([]);
  const load = useCallback(async () => {
    if (!user?.id || !notificationsEnabled) { setItems([]); return; }
    const { data, error } = await supabase.from('notifications')
      .select('id, report_id, message, created_at').eq('user_id', user.id)
      .eq('is_read', false).not('report_id', 'is', null).neq('type', 'moderation_required')
      .order('created_at', { ascending: false }).limit(3);
    if (!error) setItems(data || []);
  }, [user?.id, notificationsEnabled]);
  useEffect(() => {
    load();
    window.addEventListener('new-notification', load);
    window.addEventListener('focus', load);
    return () => { window.removeEventListener('new-notification', load); window.removeEventListener('focus', load); };
  }, [load]);
  if (!user || !notificationsEnabled || !items.length) return null;
  if (compact) return <Link to="/seguindo?aba=broncas" className="mx-4 mb-3 flex min-w-0 items-center gap-3 rounded-xl border border-brand/20 bg-brand-subtleBg px-4 py-3 text-sm font-semibold text-brand-subtleFg"><Bell className="h-5 w-5 shrink-0" /><span className="min-w-0 flex-1 break-words">Há novidades nas suas broncas</span><ArrowRight className="h-4 w-4 shrink-0" /></Link>;
  return <section className="mb-5 min-w-0 w-full max-w-full overflow-hidden rounded-2xl border border-brand/20 bg-surface-raised" aria-label="Atualizações">
    <div className="flex items-center gap-3 border-b border-edge-subtle bg-brand-subtleBg px-4 py-3">
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-content-primary"><Bell className="h-4 w-4 text-brand" />Atualizações</h2>
    </div>
    <div className="min-w-0 w-full max-w-full divide-y divide-edge-subtle px-4">{items.map((item, index) => {
      const UpdateIcon = index === 0 ? CheckCircle : index === 1 ? FileText : Send;
      return <Link key={item.id} to={`/bronca/${item.report_id}`} onClick={() => { supabase.from('notifications').update({ is_read: true }).eq('id', item.id).eq('user_id', user.id).then(() => {}); }} className="flex min-w-0 w-full max-w-full items-start gap-2.5 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-subtleBg text-brand"><UpdateIcon className="h-3.5 w-3.5" /></span>
        <span className="min-w-0 flex-1"><p className="min-w-0 max-w-full break-words text-xs font-bold leading-snug text-content-primary">{item.message || 'Uma bronca teve atualização. Veja o andamento.'}</p><TimeAgo date={item.created_at} className="mt-0.5 block text-[10px] text-content-secondary" /></span>
      </Link>;
    })}</div>
  </section>;
}
