import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Posicao do usuario para o feed "Perto de mim".
 *
 * Estados possiveis (status):
 *   'idle'        — ainda nao pedimos a posicao
 *   'prompting'   — aguardando resposta do usuario / do GPS
 *   'granted'     — temos coords
 *   'denied'      — usuario negou a permissao (nao insistir sozinho)
 *   'unavailable' — sem suporte, timeout ou falha de hardware
 *
 * 'denied' e 'unavailable' sao separados de proposito: negado e uma decisao do
 * usuario e so ele pode reverter (nas configuracoes); indisponivel costuma ser
 * temporario e faz sentido oferecer "tentar de novo".
 */

const CACHE_MS = 5 * 60 * 1000;

export function useUserLocation() {
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState('idle');
  const mountedRef = useRef(true);
  const lastFixRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }

    // Reaproveita um fix recente em vez de acordar o GPS a cada troca de aba.
    if (coords && Date.now() - lastFixRef.current < CACHE_MS) {
      setStatus('granted');
      return;
    }

    setStatus('prompting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mountedRef.current) return;
        lastFixRef.current = Date.now();
        // `speed` vem junto porque a Rota do Dia precisa saber se a pessoa
        // parou antes de pedir uma resposta (princípio 8: nada de interação em
        // movimento). É `null` em muitos aparelhos, e quem consome trata a
        // ausência como "parada" — ver `estaParado` em src/lib/rotaDoDia.js.
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed,
          accuracy: pos.coords.accuracy,
        });
        setStatus('granted');
      },
      (err) => {
        if (!mountedRef.current) return;
        setStatus(err?.code === 1 ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: CACHE_MS }
    );
  }, [coords]);

  return { coords, status, request };
}
