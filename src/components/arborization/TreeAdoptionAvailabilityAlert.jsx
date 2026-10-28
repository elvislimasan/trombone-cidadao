import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';

export default function TreeAdoptionAvailabilityAlert({ cityId, onAvailable }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    if (!user?.id || !cityId) { setLoading(false); return; }
    setLoading(true);
    supabase.from('tree_adoption_availability_alerts').select('notified_at').eq('user_id', user.id).eq('city_id', cityId).maybeSingle().then(({ data, error: failure }) => {
      if (active) { setEnabled(Boolean(data && !data.notified_at)); setError(failure ? 'Não foi possível consultar seu aviso. Você pode tentar ativá-lo abaixo.' : ''); setLoading(false); }
    });
    return () => { active = false; };
  }, [user?.id, cityId]);
  const save = async next => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const { data, error: failure } = await supabase.rpc('set_tree_adoption_availability_alert', { p_city: cityId, p_enabled: next });
      if (failure || !data) throw failure || Error('Resposta inválida');
      if (!mounted.current) return;
      setEnabled(data.enabled === true);
      if (data.available) onAvailable();
    } catch { if (mounted.current) setError('Não foi possível atualizar seu aviso. Tente novamente.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  if (!user || !cityId) return null;
  return <div className="space-y-2">
    {enabled ? <><p role="status" className="flex items-start gap-2 text-sm font-medium"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" />Aviso ativado. Você receberá uma notificação quando houver mudas disponíveis nesta cidade.</p><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => save(false)}>Cancelar aviso</Button></> : <><Button type="button" className="h-auto min-h-10 gap-2 whitespace-normal py-2 text-left" disabled={busy || loading} onClick={() => save(true)}>{busy || loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Bell className="h-4 w-4 shrink-0" />}Avise-me quando tiver disponibilidade</Button><p className="text-xs text-content-secondary">O aviso aparecerá nas notificações da sua conta para esta cidade.</p></>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
