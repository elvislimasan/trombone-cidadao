import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { NAV_ALERTA } from '@/lib/navGeo';
import { closestPatrolPole, nextPatrolPole, DEFAULT_PATROL_FILTERS, filterPatrolPoles, ELECTRICIAN_PATROL_ALERT_MS, patrolPositionIsPrecise } from '@/lib/electricianPatrol';

import { useAuth } from '@/contexts/SupabaseAuthContext';
import { readElectricianCache, writeElectricianCache } from '@/lib/electricianOffline';
import { ehErroDeRede } from '@/lib/offlineErros';

const FIELDS = 'id,identifier,plate,address,latitude,longitude,lighting_status,is_broken,updated_at,lamp_type,lamp_power_w,raw_properties';

async function readPages(buildQuery, signal) {
  const rows = [];
  for (let offset = 0; !signal.aborted; offset += 500) {
    const { data, error } = await buildQuery().range(offset, offset + 499).abortSignal(signal);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return rows;
}

export function useElectricianPatrol({ enabled, cityId, municipalityId, position, paused, revision, filters = DEFAULT_PATROL_FILTERS }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [poles, setPoles] = useState([]);
  const [target, setTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [alert, setAlert] = useState(null);
  const [dismissal, setDismissal] = useState(0);
  const [error, setError] = useState('');
  const currentAlert = useRef(null);
  const currentTarget = useRef(null);
  const seen = useRef(new Set());
  const notified = useRef(new Set());
  const inFlight = useRef(null);
  const sequence = useRef(0);
  const changeAlert = useCallback((next) => { currentAlert.current = next; setAlert(next); }, []);
  const hideAlert = useCallback(() => changeAlert(null), [changeAlert]);
  const changeTarget = useCallback((next) => { currentTarget.current = next; setTarget(next); }, []);
  const complete = useCallback((poleId) => {
    if (poleId == null) return;
    seen.current.add(String(poleId));
    if (String(currentTarget.current?.pole.id) === String(poleId)) { changeTarget(null); changeAlert(null); }
    setDismissal(value => value + 1);
  }, [changeTarget, changeAlert]);
  const dismiss = useCallback(() => complete(currentTarget.current?.pole.id), [complete]);

  useEffect(() => {
    const generation = sequence;
    const request = inFlight;
    sequence.current++;
    inFlight.current?.abort(); inFlight.current = null;
    seen.current.clear(); notified.current.clear(); setPoles([]); setError(''); changeAlert(null); changeTarget(null);
    return () => { generation.current++; request.current?.abort(); };
  }, [enabled, cityId, municipalityId, filters.neighborhood, filters.serviceType, filters.order, userId, changeAlert, changeTarget]);
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setRefresh(value => value + 1), 60000);
    return () => clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !cityId) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    const token = ++sequence.current;
    // A prioridade vale para o município/bairro escolhido, inclusive fora dos
    // 15 m do alerta. Buscar por cidade evita trocar o destino ao se deslocar.
    Promise.all([
      readPages(() => supabase.from('poles').select(FIELDS).eq('city_id', cityId)
        .or('lighting_status.is.null,lighting_status.neq.removido')
        .order('id'), controller.signal),
      readPages(() => supabase.from('reports').select('id,pole_id,issue_type,neighborhood,created_at')
        .eq('city_id', cityId).eq('category_id', 'iluminacao').not('pole_id', 'is', null)
        .in('status', ['pending', 'in-progress', 'pending_approval', 'pending_resolution'])
        .or('moderation_status.is.null,moderation_status.neq.rejected').order('id'), controller.signal),
      municipalityId ? readPages(() => supabase.from('demandas_municipais').select('id,pole_id,issue_type,bairro,created_at')
        .eq('prefeitura_id', municipalityId).eq('category_id', 'iluminacao').not('pole_id', 'is', null)
        .in('status', ['aberta', 'triagem', 'programada', 'em_andamento', 'aguardando_informacao', 'aguardando_recurso', 'aguardando_confirmacao'])
        .order('id'), controller.signal) : Promise.resolve([]),
    ]).then(async ([data, reports, demands]) => {
      if (token !== sequence.current) return;
      const services = [...reports, ...demands];
      setPoles(filterPatrolPoles(data, services, filters)); setError('');
      await writeElectricianCache(userId, `patrol:${municipalityId}`, { poles: data, services }).catch(() => {});
    }).catch(async failure => {
      if (controller.signal.aborted || token !== sequence.current) return;
      if (ehErroDeRede(failure)) {
        const snapshot = await readElectricianCache(userId, `patrol:${municipalityId}`).catch(() => null);
        const cached = snapshot?.poles || await readElectricianCache(userId, `poles:${municipalityId}`).catch(() => null);
        if (cached && token === sequence.current) {
          setPoles(filterPatrolPoles(cached, snapshot?.services || [], filters));
          setError(snapshot ? 'Sem conexão. Usando os serviços guardados neste aparelho.' : 'Sem conexão. Usando os postes preparados; a prioridade considera a última atualização do poste.');
          return;
        }
      }
      if (token === sequence.current) setError('Não foi possível atualizar os serviços da patrulha. Prepare os postes antes de sair.');
    })
      .finally(() => { if (token === sequence.current) setLoading(false); if (inFlight.current === controller) inFlight.current = null; });
    return () => controller.abort();
  }, [enabled, cityId, municipalityId, revision, refresh, filters, userId]);

  useEffect(() => {
    if (!enabled || paused || !patrolPositionIsPrecise(position)) { changeAlert(null); return; }
    const destination = nextPatrolPole(position, poles, seen.current, filters.order, currentTarget.current?.pole);
    changeTarget(destination);
    if (!destination) { changeAlert(null); return; }
    const current = currentAlert.current;
    if (current && String(current.pole.id) === String(destination.pole.id)) {
      if (destination.distance <= NAV_ALERTA.raioAbandonoM) {
        if (Math.round(destination.distance) !== Math.round(current.distance)) changeAlert({ ...current, distance: destination.distance });
        return;
      }
    }
    const next = closestPatrolPole(position, [destination.pole], notified.current);
    if (next) {
      notified.current.add(String(next.pole.id));
      changeAlert({ ...next, expiresAt: Date.now() + ELECTRICIAN_PATROL_ALERT_MS });
    } else changeAlert(null);
  }, [enabled, paused, position, poles, dismissal, changeAlert, changeTarget, filters.order]);

  useEffect(() => {
    if (!alert) return undefined;
    const timer = setTimeout(hideAlert, Math.max(0, alert.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [alert, hideAlert]);
  // Os marcadores independem da precisão do GPS e da escolha de um destino.
  const visiblePoles = useMemo(() => poles.filter(pole => !seen.current.has(String(pole.id))
    && Number.isFinite(pole.latitude) && Math.abs(pole.latitude) <= 90
    && Number.isFinite(pole.longitude) && Math.abs(pole.longitude) <= 180), [poles, dismissal]);
  return { alert, dismiss, hideAlert, complete, target, loading, poles: visiblePoles, error };
}
