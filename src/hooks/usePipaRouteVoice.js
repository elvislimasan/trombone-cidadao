import { useEffect, useRef } from 'react';
import { useNavVoice } from '@/hooks/useNavVoice';
import { haversine } from '@/lib/navGeo';
import { pipaCoordinates } from '@/lib/pipa';
import { pipaVoiceDistanceMessage, pipaVoiceMilestone } from '@/lib/pipaRouteVoice';

export function usePipaRouteVoice({ active, tanks = [], position, gpsError, userId }) {
  const voice = useNavVoice();
  const { anunciar, mudo, suportada } = voice;
  const trips = useRef(new Map());
  const destination = tanks.find(tank => tank.id === active?.tank_id)?.name || active?.locality || 'Caixa de destino';

  useEffect(() => { trips.current.clear(); }, [userId]);

  useEffect(() => {
    if (!active || !suportada) return;
    // A solicitação pode ser reutilizada após a troca de destino. Coordenadas
    // e caixa fazem parte da chave; atualizar o workspace não reinicia avisos.
    const key = `${active.id}:${active.tank_id || ''}:${active.latitude}:${active.longitude}`;
    const fresh = position && !gpsError && Number.isFinite(position.accuracy)
      && position.accuracy >= 0 && position.accuracy <= 100
      && Date.now() - position.timestamp >= 0 && Date.now() - position.timestamp <= 15000
      && pipaCoordinates(position.lat, position.lng) && pipaCoordinates(active.latitude, active.longitude);
    const distance = fresh ? haversine(position, { lat: Number(active.latitude), lng: Number(active.longitude) }) : null;
    let trip = trips.current.get(key);
    if (!trip) {
      trip = { last: Infinity, startedAt: Date.now() };
      trips.current.set(key, trip);
      const milestone = pipaVoiceMilestone(distance);
      if (!mudo) {
        anunciar(`Rota iniciada. Destino: ${destination}.${milestone ? ` ${pipaVoiceDistanceMessage(milestone, destination)}` : ''}`);
        if (milestone) trip.last = milestone;
      }
      return;
    }
    const milestone = pipaVoiceMilestone(distance, trip.last);
    if (!milestone || mudo) return;
    // Dá tempo para a fala inicial terminar quando o primeiro GPS chega
    // logo após iniciar. Novas leituras substituem o aviso pendente.
    const timer = setTimeout(() => {
      trip.last = milestone;
      anunciar(pipaVoiceDistanceMessage(milestone, destination));
    }, Math.max(0, 4500 - (Date.now() - trip.startedAt)));
    return () => clearTimeout(timer);
  }, [active?.id, active?.tank_id, active?.latitude, active?.longitude, destination, position, gpsError, anunciar, mudo, suportada, userId]);

  return voice;
}
