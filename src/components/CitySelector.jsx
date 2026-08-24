import React, { useState, useEffect, useRef } from 'react';
import { useCityView } from '@/contexts/CityContext';
import { MapPin, Check, Globe, Search, Loader2, RotateCcw } from 'lucide-react';

/**
 * Seletor de cidade para telas de EXPLORACAO (obras, estatisticas, servicos...).
 *
 * Filtra apenas a tela onde esta montado: trocar de cidade aqui nao muda o feed
 * nem a cidade do header, e nao persiste. Ver as obras de outra cidade e uma
 * consulta, nao uma mudanca de onde voce mora — ao sair da tela, volta sozinho
 * para a cidade do header.
 *
 * Para trocar a cidade do app inteiro, use o seletor do header.
 *
 * `align` deve seguir o lado da tela onde o botao fica: o menu tem 16rem e,
 * ancorado no lado oposto, escapa da viewport e cria scroll horizontal na
 * pagina inteira.
 */
export default function CitySelector({ align = 'right' }) {
  const {
    cityId: activeCityId,
    cityName: activeCityName,
    setCityId: setActiveCity,
    isExploring,
    resetToMyCity,
    cities,
    loadingCities,
  } = useCityView();
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
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold shadow-elevation-1 transition-colors ${
            isExploring
              ? 'border-brand/40 bg-brand/10 text-brand'
              : 'border-edge-default bg-surface-raised text-content-primary hover:bg-surface-subtleHover'
          }`}
        >
          <MapPin className={`w-4 h-4 shrink-0 ${isExploring ? '' : 'text-brand'}`} />
          <span className="truncate max-w-[10rem]">{activeCityId ? (activeCityName || 'Cidade') : 'Todas as cidades'}</span>
        </button>

        {/* Sem esta saida, o usuario que explorou outra cidade nao tem como
            saber que o que ele ve nao e mais a cidade dele — nem como voltar
            sem adivinhar qual era. */}
        {isExploring && (
          <button
            type="button"
            onClick={resetToMyCity}
            title="Voltar para a minha cidade"
            aria-label="Voltar para a minha cidade"
            className="flex items-center gap-1 rounded-full border border-edge-default bg-surface-raised px-2 py-1.5 text-xs font-semibold text-content-secondary hover:bg-surface-subtleHover hover:text-content-primary transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown ancorado no mesmo lado do botão — ver `align` acima. */}
      {open && (
        <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} z-[900] mt-1 w-[min(16rem,calc(100vw-2rem))] max-h-80 overflow-y-auto rounded-xl border border-edge-subtle bg-surface-raised shadow-elevation-3`}>
          <div className="sticky top-0 bg-surface-raised p-2 border-b border-edge-subtle">
            <div className="flex items-center gap-2 rounded-lg border border-edge-default px-2 py-1.5">
              <Search className="w-4 h-4 text-content-tertiary shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Buscar cidade..."
                className="flex-1 bg-transparent outline-none text-sm text-content-primary placeholder:text-content-tertiary"
              />
            </div>
          </div>
          <button
            type="button"
            onMouseDown={() => { setActiveCity(null); setOpen(false); setSearch(''); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-content-primary hover:bg-surface-subtleHover transition-colors"
          >
            <Globe className="h-4 w-4 shrink-0 text-content-tertiary" />
            Todas as cidades
            {!activeCityId && <Check className="ml-auto h-4 w-4 text-brand" />}
          </button>
          {loadingCities ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-content-tertiary" /></div>
          ) : (
            filtered.map((city) => {
              const isActive = String(activeCityId) === String(city.id);
              return (
                <button
                  key={city.id}
                  type="button"
                  onMouseDown={() => { setActiveCity(city.id); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-surface-subtleHover border-t border-edge-subtle transition-colors ${isActive ? 'font-semibold text-brand' : 'text-content-primary'}`}
                >
                  <span className="flex-1 truncate">
                    {city.name}
                    {city.state?.uf && <span className="ml-1 text-xs text-content-tertiary">{city.state.uf}</span>}
                  </span>
                  {isActive && <Check className="h-4 w-4 shrink-0 text-brand" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
