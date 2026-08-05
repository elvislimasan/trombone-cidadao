import React, { useState, useEffect, useRef } from 'react';
import { useCity } from '@/contexts/CityContext';
import { MapPin, Check, Globe, Search, Loader2 } from 'lucide-react';

// Seletor de cidade ligado ao CityContext (mesma seleção do feed).
export default function CitySelector() {
  const { activeCityId, activeCityName, setActiveCity, cities, loadingCities } = useCity();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  // Fecha ao clicar fora do container
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
  const filtered = cities
    .filter((c) => {
      if (!search.trim()) return true;
      const term = norm(search.trim());
      return norm(c.name).includes(term) || (c.state?.uf || '').toLowerCase().includes(term);
    })
    .slice(0, search.trim() ? undefined : 50);

  return (
    <div className="relative z-[900]" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm hover:bg-muted transition-colors"
      >
        <MapPin className="w-4 h-4 text-tc-red shrink-0" />
        <span className="truncate max-w-[10rem]">{activeCityId ? (activeCityName || 'Cidade') : 'Todas as cidades'}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-[900] mt-1 w-64 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
          <div className="sticky top-0 bg-popover p-2 border-b border-border/50">
            <div className="flex items-center gap-2 rounded-lg border border-input px-2 py-1.5">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Buscar cidade..."
                className="flex-1 bg-transparent outline-none text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onMouseDown={() => { setActiveCity(null); setOpen(false); setSearch(''); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            Todas as cidades
            {!activeCityId && <Check className="ml-auto h-4 w-4 text-primary" />}
          </button>
          {loadingCities ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            filtered.map((city) => {
              const isActive = String(activeCityId) === String(city.id);
              return (
                <button
                  key={city.id}
                  type="button"
                  onMouseDown={() => { setActiveCity(city.id); setOpen(false); setSearch(''); }}
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
      )}
    </div>
  );
}
