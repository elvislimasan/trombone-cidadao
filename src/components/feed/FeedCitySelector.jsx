import React, { useState, useEffect, useRef } from 'react';
import { Loader2, MapPin, ChevronDown, LocateFixed, Globe, Check, X } from 'lucide-react';
import { useCity, parseCityFromNominatim, matchCityInList } from '@/contexts/CityContext';
import { useToast } from '@/components/ui/use-toast';

const FeedCitySelector = () => {
  const { activeCityId, activeCityName, setActiveCity, cities, loadingCities } = useCity();
  const { toast } = useToast();
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const cityPickerRef = useRef(null);
  // Ref sempre atualizada para evitar closure stale quando cities ainda não carregou
  const citiesRef = useRef(cities);
  useEffect(() => { citiesRef.current = cities; }, [cities]);

  // Fecha o city picker ao clicar fora
  useEffect(() => {
    if (!cityPickerOpen) return;
    const handler = (e) => {
      if (cityPickerRef.current && !cityPickerRef.current.contains(e.target)) {
        setCityPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [cityPickerOpen]);

  const handleGps = () => {
    if (!navigator.geolocation || gpsLoading) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const { name, uf } = parseCityFromNominatim(json.address || {});
          const found = matchCityInList(citiesRef.current, name, uf);
          if (found) {
            setActiveCity(found.id);
            setCityPickerOpen(false);
          } else {
            const listSize = citiesRef.current.length;
            toast({
              title: 'Cidade não encontrada',
              description: listSize === 0
                ? 'Lista de cidades ainda carregando. Aguarde e tente novamente.'
                : name ? `"${name}" não está no cadastro. Escolha manualmente.` : 'Escolha manualmente na lista.',
              duration: 4000,
            });
          }
        } catch {
          toast({ title: 'Erro ao obter localização', description: 'Verifique sua conexão e tente novamente.', duration: 4000 });
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        setGpsLoading(false);
        const denied = err?.code === 1;
        toast({
          title: denied ? 'Localização bloqueada' : 'Não foi possível obter localização',
          description: denied
            ? 'Permita o acesso à localização nas configurações do navegador.'
            : 'Verifique se a localização está ativada e tente novamente.',
          duration: 5000,
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  return (
    <div className="pt-2 pb-1 relative" ref={cityPickerRef}>
      <button
        type="button"
        onClick={() => { setCityPickerOpen(v => !v); setCitySearch(''); }}
        className="flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
      >
        <MapPin className="h-3 w-3 shrink-0 text-primary" />
        <span className="max-w-[180px] truncate">
          {activeCityName ?? 'Todas as cidades'}
        </span>
        <ChevronDown className={`h-3 w-3 shrink-0 opacity-60 transition-transform ${cityPickerOpen ? 'rotate-180' : ''}`} />
      </button>

      {cityPickerOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-border bg-background shadow-xl overflow-hidden">
          {/* Busca */}
          <div className="flex items-center gap-2 p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              placeholder="Buscar cidade..."
              value={citySearch}
              onChange={e => setCitySearch(e.target.value)}
              className="flex-1 rounded-lg bg-muted px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {citySearch && (
              <button type="button" onClick={() => setCitySearch('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto">
            {/* GPS */}
            <button
              type="button"
              disabled={gpsLoading}
              onClick={handleGps}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-muted transition-colors"
            >
              {gpsLoading
                ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                : <LocateFixed className="h-4 w-4 shrink-0" />
              }
              {gpsLoading ? 'Detectando...' : 'Usar minha localização'}
            </button>

            {/* Todas as cidades */}
            <button
              type="button"
              onClick={() => { setActiveCity(null); setCityPickerOpen(false); setCitySearch(''); }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted border-t border-border/50 transition-colors"
            >
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
              Todas as cidades
              {!activeCityId && <Check className="ml-auto h-4 w-4 text-primary" />}
            </button>

            {/* Lista de cidades */}
            {loadingCities ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              cities
                .filter(c => {
                  if (!citySearch.trim()) return true;
                  const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
                  const term = norm(citySearch.trim());
                  return norm(c.name).includes(term) || (c.state?.uf || '').toLowerCase().includes(term.toLowerCase());
                })
                .slice(0, citySearch.trim() ? undefined : 50)
                .map(city => {
                  const isActive = String(activeCityId) === String(city.id);
                  return (
                    <button
                      key={city.id}
                      type="button"
                      onClick={() => { setActiveCity(city.id); setCityPickerOpen(false); setCitySearch(''); }}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-muted border-t border-border/50 transition-colors ${isActive ? 'font-semibold text-primary' : 'text-foreground'}`}
                    >
                      <span className="flex-1 truncate">
                        {city.name}
                        {city.state?.uf && <span className="ml-1 text-xs text-muted-foreground">{city.state.uf}</span>}
                      </span>
                      {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedCitySelector;
