import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, LocateFixed, Globe, Check, X } from 'lucide-react';
import Icon from '@/design-system/icons';
import TromboneSpinner from '@/design-system/feedback/TromboneSpinner';
import { useCity, parseCityFromNominatim, matchCityInList } from '@/contexts/CityContext';
import { useToast } from '@/components/ui/use-toast';

/**
 * @param {object} props
 * @param {boolean} [props.inHeader] Renderiza o gatilho sobre o fundo do header
 *   (vinho no claro, preto no escuro): o chip herda a cor do header em vez das
 *   superficies da pagina, que sumiriam contra ele. O dropdown continua usando
 *   as superficies normais — e um painel flutuante sobre o conteudo.
 * @param {boolean} [props.iconOnly] Gatilho reduzido a um icone de pin, e a
 *   lista abre como sheet centralizado em vez de dropdown ancorado. Usado no
 *   header, onde o nome da cidade competia com o nome da marca pelo espaco;
 *   o sheet tambem evita o corte na borda direita que o dropdown ancorado
 *   sofria em telas estreitas.
 */
const FeedCitySelector = ({ inHeader = false, iconOnly = false }) => {
  const { activeCityId, activeCityName, setActiveCity, cities, loadingCities } = useCity();
  const { toast } = useToast();
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const cityPickerRef = useRef(null);
  // Ref sempre atualizada para evitar closure stale quando cities ainda não carregou
  const citiesRef = useRef(cities);
  useEffect(() => { citiesRef.current = cities; }, [cities]);

  // Objeto completo da cidade ativa (o contexto expoe apenas id e nome), para
  // exibi-la com a UF no topo da lista. Comparacao por string: match_city e as
  // RPCs devolvem bigint como string no JSON.
  const activeCity = activeCityId
    ? cities.find(c => String(c.id) === String(activeCityId)) ?? null
    : null;

  // Fecha o city picker ao clicar fora. No modo sheet quem fecha e o overlay,
  // que cobre a tela toda -- o listener de documento fecharia no mesmo toque
  // que abre o painel, ja que o sheet nao esta dentro do cityPickerRef.
  useEffect(() => {
    if (!cityPickerOpen || iconOnly) return;
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
  }, [cityPickerOpen, iconOnly]);

  // Esc fecha o sheet e o scroll do fundo fica travado enquanto ele esta aberto.
  useEffect(() => {
    if (!cityPickerOpen || !iconOnly) return;
    const onKey = (e) => { if (e.key === 'Escape') setCityPickerOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [cityPickerOpen, iconOnly]);

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

  // Conteudo compartilhado entre o dropdown ancorado e o sheet: busca, GPS,
  // "todas as cidades" e a lista. So o involucro muda entre os dois modos.
  const pickerBody = (
    <>
      {/* Busca */}
      <div className="flex items-center gap-2 p-2 border-b border-edge-subtle">
        <input
          autoFocus
          type="text"
          placeholder="Buscar cidade..."
          value={citySearch}
          onChange={e => setCitySearch(e.target.value)}
          className="flex-1 rounded-lg bg-surface-sunken px-3 py-1.5 text-sm text-content-primary placeholder:text-content-secondary focus:outline-none"
        />
        {citySearch && (
          <button type="button" onClick={() => setCitySearch('')} className="text-content-secondary hover:text-content-primary">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className={iconOnly ? 'max-h-[55vh] overflow-y-auto' : 'max-h-60 overflow-y-auto'}>
        {/* GPS */}
        <button
          type="button"
          disabled={gpsLoading}
          onClick={handleGps}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-brand hover:bg-surface-sunken transition-colors"
        >
          {gpsLoading
            ? <TromboneSpinner size={16} />
            : <LocateFixed className="h-4 w-4 shrink-0" />
          }
          {gpsLoading ? 'Detectando...' : 'Usar minha localização'}
        </button>

        {/* Todas as cidades */}
        <button
          type="button"
          onClick={() => { setActiveCity(null); setCityPickerOpen(false); setCitySearch(''); }}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-content-primary hover:bg-surface-sunken border-t border-edge-subtle transition-colors"
        >
          <Globe className="h-4 w-4 shrink-0 text-content-secondary" />
          Todas as cidades
          {!activeCityId && <Check className="ml-auto h-4 w-4 text-brand" />}
        </button>

        {/* Cidade ativa fixada no topo: a lista e alfabetica e nacional, e sem
            busca so os 50 primeiros aparecem -- a cidade selecionada ficaria
            fora da tela, sem como conferir ou reencontrar. */}
        {!citySearch.trim() && activeCity && (
          <button
            type="button"
            onClick={() => { setCityPickerOpen(false); setCitySearch(''); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left font-semibold text-brand bg-brand-subtleBg border-t border-edge-subtle transition-colors"
          >
            <span className="flex-1 truncate">
              {activeCity.name}
              {activeCity.state?.uf && <span className="ml-1 text-xs font-normal opacity-70">{activeCity.state.uf}</span>}
            </span>
            <Check className="h-4 w-4 shrink-0" />
          </button>
        )}

        {/* Lista de cidades */}
        {loadingCities ? (
          <div className="flex justify-center py-4"><TromboneSpinner size={20} /></div>
        ) : (
          cities
            .filter(c => {
              if (!citySearch.trim()) {
                // Sem busca, a ativa ja aparece fixada acima -- evita duplicar
                // quando ela tambem cai entre as 50 primeiras do alfabeto.
                return !activeCity || String(c.id) !== String(activeCity.id);
              }
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
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-surface-sunken border-t border-edge-subtle transition-colors ${isActive ? 'font-semibold text-brand' : 'text-content-primary'}`}
                >
                  <span className="flex-1 truncate">
                    {city.name}
                    {city.state?.uf && <span className="ml-1 text-xs text-content-secondary">{city.state.uf}</span>}
                  </span>
                  {isActive && <Check className="h-4 w-4 shrink-0 text-brand" />}
                </button>
              );
            })
        )}
      </div>
    </>
  );

  // Modo icone: pin no header, lista em sheet centralizado.
  if (iconOnly) {
    return (
      <>
        <button
          type="button"
          onClick={() => { setCityPickerOpen(true); setCitySearch(''); }}
          className="flex items-center justify-center h-10 w-10 rounded-full text-current hover:bg-white/10 transition-colors"
          aria-label={activeCityName ? `Cidade: ${activeCityName}. Toque para trocar` : 'Escolher cidade'}
          title={activeCityName ?? 'Todas as cidades'}
        >
          <Icon name="location" size={22} className="shrink-0" />
        </button>

        {cityPickerOpen && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setCityPickerOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Escolher cidade"
              className="relative w-full max-w-sm rounded-2xl border border-edge-subtle bg-surface-overlay text-content-primary shadow-xl overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-edge-subtle">
                {/* A cidade ativa aparece aqui: a lista comeca no alfabeto e o
                    gatilho e so um pin, entao sem isso nao havia onde ler qual
                    cidade filtra o conteudo. */}
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold">Escolher cidade</span>
                  <span className="flex items-center gap-1 text-xs text-content-secondary truncate">
                    <Icon name="location" size={12} className="shrink-0 text-brand" />
                    {activeCityName ?? 'Todas as cidades'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCityPickerOpen(false)}
                  className="text-content-secondary hover:text-content-primary shrink-0"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {pickerBody}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={inHeader ? 'relative min-w-0' : 'pt-2 pb-1 relative'} ref={cityPickerRef}>
      <button
        type="button"
        onClick={() => { setCityPickerOpen(v => !v); setCitySearch(''); }}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
          inHeader
            ? 'border-current/25 bg-white/10 text-current hover:bg-white/20'
            : 'border-edge-subtle bg-surface-sunken text-content-primary hover:bg-surface-sunken'
        }`}
      >
        <Icon name="location" size={12} className={`shrink-0 ${inHeader ? '' : 'text-brand'}`} />
        <span className={`truncate ${inHeader ? 'max-w-[38vw]' : 'max-w-[180px]'}`}>
          {activeCityName ?? 'Todas as cidades'}
        </span>
        <ChevronDown className={`h-3 w-3 shrink-0 opacity-60 transition-transform ${cityPickerOpen ? 'rotate-180' : ''}`} />
      </button>

      {cityPickerOpen && (
        <div className={`absolute top-full mt-1 z-20 rounded-xl border border-edge-subtle bg-surface-overlay shadow-xl overflow-hidden ${
          inHeader ? 'left-0 w-[72vw] max-w-xs text-content-primary' : 'left-0 right-0'
        }`}>
          {pickerBody}
        </div>
      )}
    </div>
  );
};

export default FeedCitySelector;
