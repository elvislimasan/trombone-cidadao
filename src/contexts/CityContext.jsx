import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const STORAGE_KEY = 'tc_active_city_id';
// "Todas as cidades" e uma ESCOLHA do usuario, nao ausencia de escolha. Sem um
// valor proprio, remover a chave fazia o app cair nos fallbacks (cidade do
// perfil / GPS) no proximo carregamento e trocar de cidade sozinho.
const ALL_CITIES = '__all__';

const CityContext = createContext(undefined);

export const normCity = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').trim();

// Extrai cidade + UF de uma resposta do Nominatim para o Brasil.
// Tenta os campos em ordem de precisão — county cobre municípios que o
// Nominatim não classifica como city/town/village.
export const parseCityFromNominatim = (addr) => {
  const name =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||         // cobre muitos municípios BR no Nominatim
    addr.city_district ||  // usado pelo Nominatim para alguns municípios BR
    addr.hamlet ||
    addr.suburb ||
    '';
  // ISO3166-2-lvl4 = "BR-SP", split('-')[1] = "SP"
  const uf = (addr['ISO3166-2-lvl4'] || '').split('-')[1] || addr.state_code || '';
  return { name, uf };
};

// Bate nome+UF extraídos do Nominatim contra a lista de cidades do banco.
// Tenta correspondência exata primeiro; se não achar, tenta sem UF (menos
// preciso mas cobre casos onde o Nominatim devolve UF errada).
export const matchCityInList = (cities, name, uf) => {
  if (!name || cities.length === 0) return null;
  const normName = normCity(name);
  const normUf = uf.toLowerCase();
  // 1ª tentativa: nome + UF
  if (normUf) {
    const exact = cities.find(
      (c) => normCity(c.name) === normName && (c.state?.uf || '').toLowerCase() === normUf
    );
    if (exact) return exact;
  }
  // 2ª tentativa: só nome (desambiguação pelo GPS já garante região correta)
  return cities.find((c) => normCity(c.name) === normName) || null;
};

const detectCityFromGps = async (cities) => {
  if (!navigator.geolocation || cities.length === 0) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`
          );
          if (!res.ok) return resolve(null);
          const json = await res.json();
          const { name, uf } = parseCityFromNominatim(json.address || {});
          resolve(matchCityInList(cities, name, uf)?.id ?? null);
        } catch {
          resolve(null);
        }
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
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
        const PAGE = 1000;
        let all = [];
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('cities')
            .select('id, name, state:states(uf)')
            .order('name', { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all = all.concat(data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        setCities(all);
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

    // Escolheu "Todas as cidades": respeita e nao cai nos fallbacks.
    if (storedId === ALL_CITIES) { setActiveCityIdState(null); return; }

    // Defensivo: city_id e bigint no banco. Qualquer lixo no storage (sentinela
    // de versao antiga, valor editado a mao) iria parar no .eq() e o Postgres
    // rejeitaria a query inteira com "invalid input syntax for type bigint".
    if (storedId && !/^\d+$/.test(storedId)) {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      storedId = null;
    }

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
        // Grava o sentinela em vez de apagar: apagar faria o proximo
        // carregamento cair no fallback e trocar de cidade sozinho.
        localStorage.setItem(STORAGE_KEY, ALL_CITIES);
      } else {
        localStorage.setItem(STORAGE_KEY, String(cityId));
      }
    } catch {}
  }, []);

  const activeCity = activeCityId
    ? cities.find((c) => String(c.id) === String(activeCityId)) || null
    : null;

  const value = { activeCityId, activeCityName, activeCity, setActiveCity, cities, loadingCities };

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
