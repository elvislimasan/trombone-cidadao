import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCity } from '@/contexts/CityContext';
import { cn } from '@/lib/utils';

const normalize = (value) =>
  String(value || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').trim();

/**
 * Seletor pesquisável que compartilha a lista completa e paginada de cidades
 * usada pelo CitySelector. `allowedCityIds` restringe a lista quando o perfil
 * só pode administrar determinadas cidades.
 */
export default function CityCombobox({
  value,
  onChange,
  allowedCityIds,
  disabled = false,
  modal = false,
  placeholder = 'Selecione a cidade',
  searchPlaceholder = 'Buscar cidade...',
  notFoundText = 'Nenhuma cidade encontrada.',
  includeAll = false,
  allValue = 'all',
  allLabel = 'Todas as cidades',
  className,
}) {
  const { cities, loadingCities } = useCity();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const availableCities = useMemo(() => {
    if (allowedCityIds === undefined) return cities;
    const allowed = new Set(allowedCityIds.map(String));
    return cities.filter((city) => allowed.has(String(city.id)));
  }, [allowedCityIds, cities]);

  const selectedCity = availableCities.find((city) => String(city.id) === String(value));
  const isAllSelected = includeAll && String(value) === String(allValue);
  const term = normalize(search);
  const filteredCities = availableCities
    .filter((city) => !term || normalize(`${city.name} ${city.state?.uf || ''}`).includes(term))
    .slice(0, term ? 100 : 50);

  const select = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch('');
      }}
      modal={modal}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className="truncate text-left">
            {isAllSelected
              ? allLabel
              : selectedCity
                ? `${selectedCity.name}${selectedCity.state?.uf ? ` - ${selectedCity.state.uf}` : ''}`
                : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[10001] w-[--radix-popover-trigger-width] overflow-hidden rounded-xl border-edge-subtle p-0 shadow-elevation-3">
        <Command shouldFilter={false} className="rounded-xl bg-surface-raised">
          <CommandInput
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder={searchPlaceholder}
          />
          <CommandList className="max-h-72">
            {!loadingCities && <CommandEmpty>{notFoundText}</CommandEmpty>}
            <CommandGroup>
              {includeAll && (
                <CommandItem value={String(allValue)} onSelect={() => select(allValue)} className="gap-2 px-3 py-2.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />
                  <span className="min-w-0 flex-1 truncate">{allLabel}</span>
                  {isAllSelected && <Check className="h-4 w-4 shrink-0 text-brand" />}
                </CommandItem>
              )}
              {loadingCities ? (
                <div className="flex justify-center py-5">
                  <Loader2 className="h-5 w-5 animate-spin text-content-tertiary" />
                </div>
              ) : (
                filteredCities.map((city) => {
                  const selected = String(value) === String(city.id);
                  return (
                    <CommandItem
                      key={city.id}
                      value={String(city.id)}
                      onSelect={() => select(city.id)}
                      className="gap-2 px-3 py-2.5"
                    >
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />
                      <span className="min-w-0 flex-1 truncate">
                        {city.name}
                        {city.state?.uf && <span className="ml-1 text-xs text-content-tertiary">- {city.state.uf}</span>}
                      </span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-brand" />}
                    </CommandItem>
                  );
                })
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
