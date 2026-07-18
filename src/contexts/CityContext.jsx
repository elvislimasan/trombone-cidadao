import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const STORAGE_KEY = 'tc_active_city_id';

const CityContext = createContext(undefined);

const normalize = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const detectCityFromGps = async (cities) => {
  if (!navigator.geolocation || cities.length === 0) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`,
            { headers: { 'User-Agent': 'TromboneCidadao/1.0' } }
          );
          const json = await res.json();
          const cityName = json.address?.city || json.address?.town || json.address?.village || json.address?.municipality || '';
          const stateCode = json.address?.['ISO3166-2-lvl4']?.split('-')[1] || '';
          if (!cityName) return resolve(null);
          const found = cities.find((c) => {
            const nameMatch = normalize(c.name) === normalize(cityName);
            const ufMatch = !stateCode || (c.state?.uf || '').toLowerCase() === stateCode.toLowerCase();
            return nameMatch && ufMatch;
          });
          resolve(found?.id ?? null);
        } catch {
          resolve(null);
        }
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
};

export const CityProvider = ({ children }) => {
  const { user } = useAuth();
  const [cities, setCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [activeCityId, setActiveCityIdState] = useState(null);
  const [activeCityName, setActiveCityName] = useState(null);
  const gpsTriedRef = useRef(false);

  // Load all cities once on mount
  useEffect(() => {
    const fetchCities = async () => {
      setLoadingCities(true);
      try {
        const { data, error } = await supabase
          .from('cities')
          .select('id, name, state:states(uf)')
          .order('name', { ascending: true });
        if (error) throw error;
        setCities(data || []);
      } catch (err) {
        console.error('[CityContext] Erro ao carregar cidades:', err);
        setCities([]);
      } finally {
        setLoadingCities(false);
      }
    };
    fetchCities();
  }, []);

  // Resolve cidade ativa: localStorage → user.city_id → GPS (anônimo) → null
  useEffect(() => {
    if (cities.length === 0) return;

    let storedId = null;
    try { storedId = localStorage.getItem(STORAGE_KEY); } catch {}

    // Se já tem escolha persistida ou cidade do perfil, usa direto
    if (storedId) { setActiveCityIdState(storedId); return; }
    if (user?.city_id) { setActiveCityIdState(user.city_id); return; }

    // Sem login e sem escolha salva: tenta GPS uma única vez por sessão
    if (gpsTriedRef.current) return;
    gpsTriedRef.current = true;

    detectCityFromGps(cities).then((cityId) => {
      if (cityId) setActiveCityIdState(cityId);
    });
  }, [cities, user?.city_id]);

  // Keep activeCityName in sync
  useEffect(() => {
    if (!activeCityId || cities.length === 0) { setActiveCityName(null); return; }
    const found = cities.find((c) => String(c.id) === String(activeCityId));
    if (found) {
      const uf = found.state?.uf || '';
      setActiveCityName(uf ? `${found.name} · ${uf}` : found.name);
    } else {
      setActiveCityName(null);
    }
  }, [activeCityId, cities]);

  const setActiveCity = useCallback((cityId) => {
    setActiveCityIdState(cityId);
    try {
      if (cityId === null || cityId === undefined) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, String(cityId));
      }
    } catch {}
  }, []);

  const value = { activeCityId, activeCityName, setActiveCity, cities, loadingCities };

  return (
    <CityContext.Provider value={value}>
      {children}
    </CityContext.Provider>
  );
};

export const useCity = () => {
  const context = useContext(CityContext);
  if (context === undefined) {
    throw new Error('useCity must be used within a CityProvider');
  }
  return context;
};
