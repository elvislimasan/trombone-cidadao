import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PipaDriverScreens from '@/components/municipality/PipaDriverScreens';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useTheme } from '@/design-system/theme/ThemeProvider';
import { usePipaRouteVoice } from '@/hooks/usePipaRouteVoice';
import { supabase } from '@/lib/customSupabaseClient';
import { pipaRpc } from '@/lib/pipaApi';
import { pipaFreshPosition, PIPA_DRIVER_PATH } from '@/lib/pipa';
import '@/components/municipality/pipa.css';

export default function PipaDriverPage() {
  const { user, signOut } = useAuth(), navigate = useNavigate(), location = useLocation();
  const { resolved: theme, setPreference } = useTheme();
  const [branding, setBranding] = useState({ name: 'Trombone Cidadão', logo: '/logo.png' });
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [tankId, setTankId] = useState('');
  const [position, setPosition] = useState(null), [gpsError, setGpsError] = useState(''), [liters, setLiters] = useState('');
  const currentUser = useRef(user?.id), revision = useRef(0), saving = useRef(false), deliveryId = useRef(crypto.randomUUID());
  currentUser.current = user?.id;
  const refresh = useCallback(async () => {
    const next = ++revision.current, userId = user?.id;
    setRefreshing(true);
    try {
      const data = await pipaRpc('pipa_driver_workspace');
      if (next === revision.current && userId === currentUser.current) { setState({ ...data, userId }); setLoadError(''); }
    } catch (failure) { if (next === revision.current && userId === currentUser.current) { setLoadError(failure.message); setState(null); } }
    finally { if (next === revision.current) { setLoading(false); setRefreshing(false); } }
  }, [user?.id]);
  useEffect(() => {
    let active = true;
    const readBranding = async () => {
      try {
        const { data } = await supabase.from('site_config').select('site_name,logo_url').eq('id', 1).maybeSingle();
        if (active && data) setBranding({ name: data.site_name || 'Trombone Cidadão', logo: data.logo_url || '/logo.png' });
      } catch { /* A marca padrão mantém o cabeçalho disponível. */ }
    };
    readBranding(); window.addEventListener('site-settings-updated', readBranding);
    return () => { active = false; window.removeEventListener('site-settings-updated', readBranding); };
  }, []);
  useEffect(() => {
    setState(null); setLoading(true); setTankId(''); setPosition(null); setNotice(''); refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 20000);
    window.addEventListener('focus', refresh);
    return () => { revision.current++; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  const data = state?.userId === user?.id ? state : null;
  const active = data?.requests.find(r => r.status === 'in_transit');
  const voice = usePipaRouteVoice({ active, tanks: data?.tanks, position, gpsError, userId: user?.id });
  const positionChanged = result => { setPosition({ lat: result.coords.latitude, lng: result.coords.longitude, accuracy: result.coords.accuracy, timestamp: result.timestamp }); setGpsError(''); };
  useEffect(() => {
    deliveryId.current = crypto.randomUUID(); setLiters(data?.driver.capacity_liters || '');
    if (!active && !location.pathname.endsWith('/mapa')) return undefined;
    if (!navigator.geolocation) { setGpsError('GPS indisponível neste aparelho. Solicite o lançamento manual à secretaria.'); return undefined; }
    const watch = navigator.geolocation.watchPosition(positionChanged, () => setGpsError('Não foi possível obter o GPS. Permita a localização no aparelho e tente novamente.'), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [active?.id, data?.driver.capacity_liters, location.pathname]);
  const start = async (requestId, selectedTank) => {
    if (saving.current) return; saving.current = true; setBusy(true); setError(''); setNotice('');
    voice.preparar();
    try {
      if (active && selectedTank && selectedTank !== active.tank_id) await pipaRpc('pipa_change_destination', { p_tank: selectedTank });
      else await pipaRpc('pipa_start_trip', { p_tank: selectedTank || null, p_request: requestId || null });
      setTankId(''); await refresh(); navigate(`${PIPA_DRIVER_PATH}/mapa${location.search}`);
    }
    catch (failure) { setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  };
  const complete = async (event, levelAfter) => {
    event.preventDefault(); if (saving.current || !active) return;
    saving.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await pipaFreshPosition(position, navigator.geolocation);
      positionChanged(result);
      await pipaRpc('pipa_record_delivery', { p_data: { id: deliveryId.current, request_id: active.id, source: 'gps', liters: Number(liters), latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy_m: result.coords.accuracy, level_after_percent: levelAfter === '' || levelAfter == null ? null : Number(levelAfter) } });
      setNotice('Abastecimento registrado. A secretaria já pode consultar a entrega.'); setTankId(''); await refresh(); return true;
    } catch (failure) { setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  };
  const cancelRoute = async id => {
    if (saving.current) return; saving.current = true; setBusy(true); setError('');
    try { await pipaRpc('pipa_cancel_route', { p_route: id }); await refresh(); }
    catch (failure) { setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  };
  return <PipaDriverScreens data={data} loading={loading} branding={branding} theme={theme} setPreference={setPreference} signOut={signOut} error={error || loadError} notice={notice} refreshing={refreshing} refresh={refresh} busy={busy} active={active} position={position} gpsError={gpsError} liters={liters} setLiters={setLiters} tankId={tankId} setTankId={setTankId} start={start} complete={complete} cancelRoute={cancelRoute} voice={voice} />;
}
