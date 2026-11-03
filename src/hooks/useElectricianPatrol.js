import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { haversine, NAV_ALERTA } from '@/lib/navGeo';
import { brokenPole, closestPatrolPole, DEFAULT_PATROL_FILTERS, filterPatrolPoles, ELECTRICIAN_PATROL_ALERT_MS, patrolPoleBounds, patrolPositionIsPrecise } from '@/lib/electricianPatrol';

import { useAuth } from '@/contexts/SupabaseAuthContext';
import { readElectricianCache } from '@/lib/electricianOffline';
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
  const [alert, setAlert] = useState(null);
  const [dismissal, setDismissal] = useState(0);
  const [error, setError] = useState('');
  const currentAlert = useRef(null);
  const seen = useRef(new Set());
  const center = useRef(null);
  const inFlight = useRef(null);
  const sequence = useRef(0);
  const changeAlert = useCallback((next) => { currentAlert.current = next; setAlert(next); }, []);
  const dismiss = useCallback(() => { changeAlert(null); setDismissal((value) => value + 1); }, [changeAlert]);

  useEffect(() => {
    const generation = sequence;
    const request = inFlight;
    sequence.current++;
    inFlight.current?.abort(); inFlight.current = null;
    center.current = null;
    seen.current.clear(); setPoles([]); setError(''); changeAlert(null);
    return () => { generation.current++; request.current?.abort(); };
  }, [enabled, cityId, municipalityId, filters.neighborhood, filters.serviceType, filters.order, changeAlert]);
  useEffect(() => {
    sequence.current++; inFlight.current?.abort(); inFlight.current = null;
    center.current = null; setPoles([]); changeAlert(null);
  }, [revision, changeAlert]);

  useEffect(() => {
    if (!enabled || !cityId || !patrolPositionIsPrecise(position) || inFlight.current) return;
    if (center.current && haversine(center.current, position) < 75 && Date.now() - center.current.fetchedAt < 30000) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const token = ++sequence.current;
    const bounds = patrolPoleBounds(position);
    // Os filtros da preparação governam tanto os pins quanto os alertas.
    readPages(() => supabase.from('poles').select(FIELDS).eq('city_id', cityId)
      .or('lighting_status.is.null,lighting_status.neq.removido')
      .gte('latitude', bounds.south).lte('latitude', bounds.north)
      .gte('longitude', bounds.west).lte('longitude', bounds.east)
      .order('id'), controller.signal)
      .then(async (data) => {
        if (token !== sequence.current) return;
        const services = [];
        // Lotes evitam URLs grandes no filtro de ids. A RLS continua aplicada.
        for (let offset = 0; offset < data.length; offset += 100) {
          const ids = data.slice(offset, offset + 100).map(pole => pole.id);
          const results = await Promise.all([
            readPages(() => supabase.from('reports').select('id,pole_id,issue_type,neighborhood,created_at')
              .eq('city_id', cityId).eq('category_id', 'iluminacao').in('pole_id', ids)
              .in('status', ['pending', 'in-progress', 'pending_approval', 'pending_resolution'])
              .or('moderation_status.is.null,moderation_status.neq.rejected').order('id'), controller.signal),
            municipalityId ? readPages(() => supabase.from('demandas_municipais').select('id,pole_id,issue_type,bairro,created_at')
              .eq('prefeitura_id', municipalityId).eq('category_id', 'iluminacao').in('pole_id', ids)
              .in('status', ['aberta', 'triagem', 'programada', 'em_andamento', 'aguardando_informacao', 'aguardando_recurso', 'aguardando_confirmacao'])
              .order('id'), controller.signal) : Promise.resolve([]),
          ]);
          if (token !== sequence.current) return;
          services.push(...results.flat());
        }
        if (token !== sequence.current) return;
        setPoles(filterPatrolPoles(data, services, filters)); setError('');
        center.current = { ...position, fetchedAt: Date.now() };
      }).catch(async failure => {
        if (ehErroDeRede(failure)) {
          const cached = await readElectricianCache(userId, `poles:${municipalityId}`).catch(() => null);
          if (cached && token === sequence.current) {
            setPoles(filterPatrolPoles(cached.filter(pole => pole.latitude != null && pole.longitude != null && pole.latitude >= bounds.south && pole.latitude <= bounds.north && pole.longitude >= bounds.west && pole.longitude <= bounds.east), [], filters));
            setError('Sem conexão. Usando os postes preparados neste aparelho.');
            center.current = { ...position, fetchedAt: Date.now() }; return;
          }
        }
        if (token === sequence.current) setError('Não foi possível atualizar os serviços da patrulha. Prepare os postes antes de sair.');
      })
      .finally(() => { if (inFlight.current === controller) inFlight.current = null; });
  }, [enabled, cityId, municipalityId, position, revision, filters, userId]);

  useEffect(() => {
    if (!enabled || paused || !patrolPositionIsPrecise(position)) { changeAlert(null); return; }
    const current = currentAlert.current;
    if (current) {
      const pole = poles.find((item) => String(item.id) === String(current.pole.id));
      const distance = pole && haversine(position, { lat: pole.latitude, lng: pole.longitude });
      if (brokenPole(pole) && Number.isFinite(distance) && distance <= NAV_ALERTA.raioAbandonoM) {
        if (Math.round(distance) !== Math.round(current.distance)) changeAlert({ ...current, distance });
        return;
      }
    }
    const next = closestPatrolPole(position, poles, seen.current, filters.order);
    if (next) {
      seen.current.add(String(next.pole.id));
      changeAlert({ ...next, expiresAt: Date.now() + ELECTRICIAN_PATROL_ALERT_MS });
    } else changeAlert(null);
  }, [enabled, paused, position, poles, dismissal, changeAlert, filters.order]);

  useEffect(() => {
    if (!alert) return undefined;
    const timer = setTimeout(dismiss, Math.max(0, alert.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [alert, dismiss]);
  return { alert, dismiss, poles, error };
}
