import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const STORAGE_KEY = 'tc_active_city_id';

const CityContext = createContext(undefined);

export const CityProvider = ({ children }) => {
  const { user } = useAuth();
  const [cities, setCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [activeCityId, setActiveCityIdState] = useState(null);
  const [activeCityName, setActiveCityName] = useState(null);

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

  // Derive activeCityId: localStorage → user.city_id → null
  useEffect(() => {
    let storedId = null;
    try {
      storedId = localStorage.getItem(STORAGE_KEY);
    } catch {}

    const resolvedId = storedId ?? user?.city_id ?? null;
    setActiveCityIdState(resolvedId);
  }, [user?.city_id]);

  // Keep activeCityName in sync whenever cities list or activeCityId changes
  useEffect(() => {
    if (!activeCityId || cities.length === 0) {
      setActiveCityName(null);
      return;
    }
    const found = cities.find((c) => c.id === activeCityId || String(c.id) === String(activeCityId));
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

  const value = {
    activeCityId,
    activeCityName,
    setActiveCity,
    cities,
    loadingCities,
  };

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
