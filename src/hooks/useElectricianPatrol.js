import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { haversine, NAV_ALERTA } from '@/lib/navGeo';
import { brokenPole, closestPatrolPole, ELECTRICIAN_PATROL_ALERT_MS, patrolPoleBounds, patrolPositionIsPrecise } from '@/lib/electricianPatrol';

const FIELDS = 'id,identifier,plate,address,latitude,longitude,lighting_status,is_broken,updated_at,lamp_type,lamp_power_w';

export function useElectricianPatrol({ enabled, cityId, position, paused, revision }) {
  const [poles, setPoles] = useState([]);
  const [alert, setAlert] = useState(null);
  const [dismissal, setDismissal] = useState(0);
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
    seen.current.clear(); setPoles([]); changeAlert(null);
    return () => { generation.current++; request.current?.abort(); };
  }, [enabled, cityId, changeAlert]);
  useEffect(() => {
    sequence.current++; inFlight.current?.abort(); inFlight.current = null;
    center.current = null;
  }, [revision]);

  useEffect(() => {
    if (!enabled || !cityId || !patrolPositionIsPrecise(position) || inFlight.current) return;
    if (center.current && haversine(center.current, position) < 75 && Date.now() - center.current.fetchedAt < 30000) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const token = ++sequence.current;
    const bounds = patrolPoleBounds(position);
    // Independente dos filtros e agrupamentos do mapa: um poste apagado deve
    // alertar também quando a pessoa estiver consultando os postes acesos.
    supabase.from('poles').select(FIELDS).eq('city_id', cityId)
      .neq('lighting_status', 'removido')
      .or('lighting_status.eq.apagado,lighting_status.eq.manutencao,is_broken.eq.true')
      .gte('latitude', bounds.south).lte('latitude', bounds.north)
      .gte('longitude', bounds.west).lte('longitude', bounds.east)
      .limit(500).abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (token !== sequence.current || error) return;
        setPoles(data || []);
        center.current = { ...position, fetchedAt: Date.now() };
      }).catch(() => { /* Uma falha transitória mantém os postes já consultados. */ })
      .finally(() => { if (inFlight.current === controller) inFlight.current = null; });
  }, [enabled, cityId, position, revision]);

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
    const next = closestPatrolPole(position, poles, seen.current);
    if (next) {
      seen.current.add(String(next.pole.id));
      changeAlert({ ...next, expiresAt: Date.now() + ELECTRICIAN_PATROL_ALERT_MS });
    } else changeAlert(null);
  }, [enabled, paused, position, poles, dismissal, changeAlert]);

  useEffect(() => {
    if (!alert) return undefined;
    const timer = setTimeout(dismiss, Math.max(0, alert.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [alert, dismiss]);
  return { alert, dismiss, poles };
}
