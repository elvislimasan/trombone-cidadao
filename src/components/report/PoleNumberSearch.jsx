import { poleCode } from '@/lib/poleDisplay';
import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';

export default function PoleNumberSearch({ cityId, selectedId, onSelect, compact = false }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const term = query.trim().replace(/[%,()"'\\]/g, '');
    if (term.length < 2) { setMatches([]); setLoading(false); return undefined; }
    let active = true;
    setLoading(true); setError('');
    const timer = window.setTimeout(async () => {
      let request = supabase.from('poles').select('id,identifier,plate,address,latitude,longitude,city_id')
        .neq('lighting_status', 'removido').or(`identifier.ilike.%${term}%,plate.ilike.%${term}%`).limit(12);
      if (cityId) request = request.eq('city_id', cityId);
      const { data, error: failure } = await request;
      if (!active) return;
      setMatches((data || []).filter((pole) => pole.latitude != null && pole.longitude != null
        && Number.isFinite(Number(pole.latitude)) && Number.isFinite(Number(pole.longitude))));
      setError(failure?.message || ''); setLoading(false);
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [cityId, query]);
  return <div className={compact ? 'relative' : 'rounded-xl border border-input bg-background p-3'}>
    <label className="block text-sm font-semibold"><span className={compact ? 'sr-only' : undefined}>Buscar pelo número do poste</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite o número do poste" autoComplete="off" className={compact ? 'h-11 rounded-xl bg-background shadow-lg' : 'mt-2'} /></label>
    {!compact && selectedId && <p className="mt-2 text-xs text-content-secondary">Poste selecionado. A localização foi preenchida automaticamente.</p>}
    {(loading || error || query.trim().length >= 2) && <div className={compact ? 'absolute inset-x-0 top-full mt-2 rounded-xl border border-input bg-background p-2 shadow-lg' : undefined}>
    {loading && <p role="status" className="mt-2 text-xs text-content-secondary">Buscando postes…</p>}
    {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    {query.trim().length >= 2 && !loading && !error && <div className="max-h-44 overflow-y-auto overscroll-contain">{matches.length ? matches.map((pole) => <button key={pole.id} type="button" onClick={() => { onSelect({ id: pole.id, location: { lat: Number(pole.latitude), lng: Number(pole.longitude) }, data: pole }); setQuery(''); }} className="block w-full border-b border-edge-subtle p-2 text-left text-sm last:border-0 hover:bg-surface-subtle"><strong>Poste {poleCode(pole.identifier || pole.plate || pole.id)}</strong><span className="block text-xs text-content-secondary">{pole.address || `Cidade ${pole.city_id}`}</span></button>) : <p className="p-2 text-xs text-content-secondary">Nenhum poste encontrado com esse número.</p>}</div>}
    </div>}
  </div>;
}
