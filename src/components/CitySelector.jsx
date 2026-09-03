import React, { useState } from 'react';
import { Check, Globe, Loader2, MapPin, RotateCcw } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCityView } from '@/contexts/CityContext';

/**
 * Seletor local de cidade para telas de exploração.
 *
 * O menu usa o portal e o posicionamento com detecção de colisão do Radix. Isso
 * é importante quando o gatilho vive dentro de painéis com `overflow-hidden`:
 * um dropdown absoluto seria recortado pela coluna e perderia o início dos
 * nomes, especialmente no mapa de pavimentação em notebook.
 */
export default function CitySelector({ align = 'right', mobileBare = false, inverted = false }) {
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

  const norm = (value) => (value || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
  const filtered = cities
    .filter((city) => {
      if (!search.trim()) return true;
      const term = norm(search.trim());
      return norm(city.name).includes(term) || norm(city.state?.uf).includes(term);
    })
    .slice(0, search.trim() ? undefined : 50);

  const chooseCity = (cityId) => {
    setActiveCity(cityId);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setSearch('');
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Selecionar cidade"
            aria-expanded={open}
            className={`flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold shadow-elevation-1 transition-colors ${
              inverted
                ? 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                : isExploring
                ? 'border-brand/40 bg-brand/10 text-brand'
                : 'border-edge-default bg-surface-raised text-content-primary hover:bg-surface-subtleHover'
            } ${mobileBare ? 'max-[899px]:gap-1.5 max-[899px]:border-transparent max-[899px]:bg-transparent max-[899px]:px-0 max-[899px]:py-0 max-[899px]:text-xs max-[899px]:shadow-none max-[899px]:hover:bg-transparent' : ''}`}
          >
            <MapPin className={`h-4 w-4 shrink-0 ${inverted ? 'text-white/75' : isExploring ? '' : 'text-brand'} ${mobileBare ? 'max-[899px]:h-3.5 max-[899px]:w-3.5' : ''}`} />
            <span className={`max-w-[10rem] truncate ${mobileBare ? 'max-[899px]:max-w-[7.5rem]' : ''}`}>
              {activeCityId ? (activeCityName || 'Cidade') : 'Todas as cidades'}
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent
          align={align === 'left' ? 'start' : 'end'}
          sideOffset={6}
          collisionPadding={12}
          className="z-[10001] w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border-edge-subtle p-0 shadow-elevation-3"
        >
          <Command shouldFilter={false} className="rounded-xl bg-surface-raised">
            <CommandInput
              autoFocus
              value={search}
              onValueChange={setSearch}
              placeholder="Buscar cidade..."
              className="text-sm"
            />
            <CommandList className="max-h-72">
              <CommandEmpty>Nenhuma cidade encontrada.</CommandEmpty>
              <CommandGroup heading="Cidades">
                <CommandItem
                  value="todas-as-cidades"
                  onSelect={() => chooseCity(null)}
                  className="gap-2 px-3 py-2.5"
                >
                  <Globe className="h-4 w-4 shrink-0 text-content-tertiary" />
                  <span className="min-w-0 flex-1 truncate font-semibold">Todas as cidades</span>
                  {!activeCityId && <Check className="h-4 w-4 shrink-0 text-brand" />}
                </CommandItem>

                {loadingCities ? (
                  <div className="flex justify-center py-5">
                    <Loader2 className="h-5 w-5 animate-spin text-content-tertiary" />
                  </div>
                ) : (
                  filtered.map((city) => {
                    const isActive = String(activeCityId) === String(city.id);
                    return (
                      <CommandItem
                        key={city.id}
                        value={String(city.id)}
                        onSelect={() => chooseCity(city.id)}
                        className={`gap-2 px-3 py-2.5 ${isActive ? 'font-semibold text-brand' : 'text-content-primary'}`}
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />
                        <span className="min-w-0 flex-1 truncate">
                          {city.name}
                          {city.state?.uf && <span className="ml-1 text-xs text-content-tertiary">{city.state.uf}</span>}
                        </span>
                        {isActive && <Check className="h-4 w-4 shrink-0 text-brand" />}
                      </CommandItem>
                    );
                  })
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {isExploring && (
        <button
          type="button"
          onClick={resetToMyCity}
          title="Voltar para a minha cidade"
          aria-label="Voltar para a minha cidade"
          className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1.5 text-xs font-semibold transition-colors ${
            inverted
              ? 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white'
              : 'border-edge-default bg-surface-raised text-content-secondary hover:bg-surface-subtleHover hover:text-content-primary'
          }`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
