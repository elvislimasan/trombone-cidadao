import { useRef, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

// Resolve o city_id SEMPRE a partir das coordenadas do marcador (não do usuário).
// Reutilizável por qualquer formulário com marcador no mapa (broncas, obras...).
export function useCityIdFromLocation() {
  const resolvedCityIdRef = useRef(null);
  const resolvedCityKeyRef = useRef(null);
  // Bairro da última resolução. A mesma resposta do reverse-geocode que traz a
  // cidade traz o bairro em `suburb`, e ele era descartado — enquanto o placar
  // de bairro precisava exatamente disso. Guardar aqui evita uma segunda
  // chamada ao Nominatim, cujo uso contínuo a política dele proíbe.
  const resolvedNeighborhoodRef = useRef(null);

  const resolveCityIdFromLocation = useCallback(async (loc) => {
    const lat = loc?.lat;
    const lng = loc?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const key = `${Number(lng).toFixed(5)},${Number(lat).toFixed(5)}`;
    if (resolvedCityKeyRef.current === key && resolvedCityIdRef.current != null) {
      return resolvedCityIdRef.current;
    }

    // match_city pode voltar bigint como number OU string ("159"). Normaliza.
    const parseCityId = (raw) => {
      if (raw == null) return null;
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const matchFromGeocode = async (zoom) => {
      const { data, error } = await supabase.functions.invoke('reverse-geocode', {
        body: { lat, lng, zoom },
      });
      if (error || !data) return null;
      const bairro = String(data.suburb ?? '').trim();
      if (bairro) resolvedNeighborhoodRef.current = bairro;
      const city = data.city;
      const state_uf = data.state_uf;
      if (!city || !state_uf) return null;
      const { data: cityId } = await supabase.rpc('match_city', { p_name: city, p_uf: state_uf });
      return parseCityId(cityId);
    };

    try {
      let cityId = await matchFromGeocode(18);
      if (cityId == null) cityId = await matchFromGeocode(10);
      if (cityId != null) {
        resolvedCityIdRef.current = cityId;
        resolvedCityKeyRef.current = key;
        return cityId;
      }
    } catch (e) {
      console.error('[useCityIdFromLocation] falhou:', e);
    }
    return resolvedCityIdRef.current;
  }, []);

  const resetCityCache = useCallback(() => {
    resolvedCityIdRef.current = null;
    resolvedCityKeyRef.current = null;
    resolvedNeighborhoodRef.current = null;
  }, []);

  /**
   * Bairro da última resolução de cidade.
   *
   * Acessor separado, e não parte do retorno de `resolveCityIdFromLocation`,
   * porque sete telas já dependem daquela função devolver o id direto — mudar
   * o formato quebraria todas para servir a uma.
   *
   * Devolve null quando o geocode não soube o bairro. Nunca invente um: uma
   * ação marcada com o bairro errado entra no placar errado, e ninguém tem
   * como descobrir isso depois.
   */
  const getResolvedNeighborhood = useCallback(() => resolvedNeighborhoodRef.current, []);

  return { resolveCityIdFromLocation, resetCityCache, getResolvedNeighborhood };
}
