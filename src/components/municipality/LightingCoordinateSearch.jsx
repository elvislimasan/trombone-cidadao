import React, { useEffect, useId, useState } from 'react';
import { ArrowRight, ChevronDown, Crosshair, Loader2, LocateFixed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { poleDisplayLabel } from '@/lib/poleDisplay';
import { loadLightingPolesNearCoordinates, parseLightingCoordinates } from '@/lib/lightingCoordinateSearch';

export default function LightingCoordinateSearch({ cityId, filters, revision, resetKey, onLocate, onSelect, renderStatus }) {
  const inputId = useId();
  const [text, setText] = useState('');
  const [radius, setRadius] = useState(100);
  const [query, setQuery] = useState(null);
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setText(''); setRadius(100); setQuery(null); setResults([]); setCount(0); setError(''); setLoading(false);
  }, [cityId, resetKey]);

  useEffect(() => {
    if (!query || !cityId) return undefined;
    const controller = new AbortController();
    setLoading(true); setError(''); setResults([]); setCount(0);
    loadLightingPolesNearCoordinates(supabase, { cityId, point: query, radius: query.radius, filters, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setResults(result.data); setCount(result.count); } })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message || 'Não foi possível buscar os postes. Tente novamente.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cityId, query, filters, revision]);

  const locate = (event) => {
    event.preventDefault();
    const point = parseLightingCoordinates(text);
    if (!point) { setError('Informe latitude e longitude válidas. Exemplo: -8.593246, -38.574775.'); return; }
    const next = { ...point, radius };
    setError(''); setQuery(next); onLocate(next);
  };

  return <details className="group rounded-xl border border-edge-subtle bg-surface-subtle">
    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-3 text-xs font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden"><Crosshair className="h-4 w-4 shrink-0" />Pesquisar por coordenadas<ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
    <div className="space-y-3 px-3 pb-3">
      <form onSubmit={locate} className="space-y-3">
        <label className="block text-xs font-semibold" htmlFor={inputId}>Latitude, longitude<Input id={inputId} value={text} onChange={(event) => { setText(event.target.value); setError(''); }} placeholder="-8.593246, -38.574775" autoComplete="off" spellCheck={false} className="mt-1.5 min-w-0 bg-surface-raised text-xs" aria-describedby={inputId + '-help'} aria-invalid={!!error} /></label>
        <p id={inputId + '-help'} className="text-[11px] leading-4 text-content-secondary">Cole as duas coordenadas juntas, na ordem latitude e longitude.</p>
        <div className="flex min-w-0 items-end gap-2"><label className="shrink-0 text-[11px] font-semibold" htmlFor={inputId + '-radius'}>Raio<select id={inputId + '-radius'} value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="mt-1 block h-9 rounded-lg border border-edge-default bg-surface-raised px-2 text-xs">{[50, 100, 250, 500].map((value) => <option key={value} value={value}>{value} m</option>)}</select></label><Button type="submit" size="sm" className="min-w-0 flex-1 px-2 text-xs" disabled={loading || !text.trim()}>{loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 shrink-0 animate-spin" /> : <LocateFixed className="mr-1.5 h-3.5 w-3.5 shrink-0" />}Localizar no mapa</Button></div>
      </form>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {query && <div aria-label="Postes próximos às coordenadas" aria-live="polite" className="max-h-72 divide-y divide-edge-subtle overflow-y-auto border-t border-edge-subtle">
        <p className="py-2 text-[11px] leading-4 text-content-secondary">Ponto: <span className="tabular-nums">{query.lat.toFixed(6)}, {query.lng.toFixed(6)}</span> · raio de {query.radius} m.</p>
        {loading ? <p role="status" className="py-2 text-xs text-content-secondary">Buscando postes próximos…</p> : !error && <>
          <p className="py-2 text-[11px] text-content-secondary">{count ? `${count.toLocaleString('pt-BR')} poste(s) próximo(s)${count > results.length ? ` · exibindo os ${results.length} mais próximos` : ''}.` : 'Nenhum poste encontrado nesse raio com os filtros atuais. O ponto está marcado no mapa.'}</p>
          {results.map((pole) => <button key={pole.id} type="button" onClick={() => onSelect(pole)} className="block w-full rounded-lg px-1 py-3 text-left hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-brand"><span className="flex items-center justify-between gap-2"><strong className="text-xs">{poleDisplayLabel(pole)}</strong><ArrowRight className="h-3.5 w-3.5 shrink-0 text-content-secondary" /></span><span className="mt-1 block text-[11px] font-semibold tabular-nums text-brand">A {pole.distance_m.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m do ponto</span><span className="mt-1 block text-xs text-content-secondary">{pole.address || 'Sem endereço'}</span>{renderStatus && <span className="mt-1.5 block">{renderStatus(pole)}</span>}</button>)}
        </>}
      </div>}
    </div>
  </details>;
}
