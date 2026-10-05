import { poleCode } from '@/lib/poleDisplay';
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LAMP_TYPES } from '@/lib/lightingCatalog';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppNotice } from '@/lib/appError';

const displayNumber = (pole) => poleCode(pole.identifier || `Poste ${pole.id}`);
const normalizeSearch = (value) => value.trim().replace(/[%,()"'\\]/g, '');

export default function BulkLampDialog({ open, onClose, cityId, onSaved }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [lamp, setLamp] = useState('LED');
  const [power, setPower] = useState('');
  const [preview, setPreview] = useState(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const poleIds = useMemo(() => selected.map((pole) => pole.id), [selected]);
  const parameters = useMemo(() => ({ p_city_id: cityId, p_pole_ids: poleIds, p_lamp_type: lamp, p_power_w: Number(power) }), [cityId, poleIds, lamp, power]);
  const previewKey = JSON.stringify(parameters);

  useEffect(() => {
    setQuery(''); setResults([]); setSelected([]); setPreview(null); setError('');
  }, [cityId]);

  useEffect(() => {
    if (!open || !cityId || !normalizeSearch(query)) {
      setResults([]); setSearching(false); return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const term = normalizeSearch(query);
      const { data, error: failure } = await supabase.from('poles')
        .select('id,identifier,address,lamp_type,lamp_power_w')
        .eq('city_id', cityId).neq('lighting_status', 'removido')
        .ilike('identifier', `%${term}%`).order('identifier').limit(20);
      if (!active) return;
      setSearching(false); setResults(data || []);
      if (failure) setError(failure.message);
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, cityId, query]);

  const addPole = (pole) => {
    if (selected.some((item) => item.id === pole.id)) return;
    if (selected.length >= 1000) { setError('Limite de 1000 postes por atualização.'); return; }
    setSelected((current) => [...current, pole]);
    setQuery(''); setResults([]); setPreview(null); setError('');
  };
  const removePole = (id) => {
    setSelected((current) => current.filter((item) => item.id !== id));
    setPreview(null); setError('');
  };

  const check = async (apply = false) => {
    setError(''); setBusy(true);
    try {
      const { data, error: failure } = await supabase.rpc('atualizar_lampadas_postes_em_massa_por_ids', { ...parameters, p_apply: apply });
      if (failure) throw failure;
      if (data.missing?.length || data.matched !== selected.length) {
        setPreview(null);
        const unavailable = selected.filter((pole) => data.missing.includes(pole.id)).map(displayNumber);
        setError(`Postes indisponíveis: ${unavailable.join(', ') || data.missing.join(', ')}. Remova-os e confira novamente. Nenhum poste foi alterado.`);
        return;
      }
      if (apply) {
        showAppNotice({ title: `${data.matched} postes atualizados` });
        setSelected([]); setQuery(''); setPreview(null); setPower('');
        onSaved(); onClose();
      } else setPreview({ ...data, key: previewKey });
    } catch (cause) { setError(cause.message || 'Não foi possível atualizar os postes.'); }
    finally { setBusy(false); }
  };

  const valid = selected.length > 0 && selected.length <= 1000 && Number(power) > 0 && Number(power) <= 999999.99;
  return <MunicipalDrawer open={open} onClose={onClose} title="Atualizar lâmpadas em massa"
    description="Pesquise cada poste, adicione à lista e confira antes de aplicar."
    busy={busy} footer={<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="button" onClick={() => check(false)} disabled={!valid || busy}>Conferir postes</Button><Button type="button" onClick={() => check(true)} disabled={busy || !preview || preview.key !== previewKey}>Atualizar {preview?.matched || 0} postes</Button></div>}>
    <div className="space-y-5">
      <section className="space-y-2">
        <label htmlFor="bulk-pole-search" className="block text-sm font-semibold">Pesquisar número do poste</label>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-secondary" /><Input id="bulk-pole-search" value={query} onChange={(event) => { setQuery(event.target.value); setResults([]); setSearching(Boolean(normalizeSearch(event.target.value))); setError(''); }} placeholder="Digite o número do poste" autoComplete="off" disabled={busy} className="pl-9" /></div>
        {Boolean(normalizeSearch(query)) && <div className="max-h-56 overflow-y-auto rounded-lg border border-edge-subtle bg-surface-raised" aria-label="Resultados da busca de postes">
          {searching ? <p className="p-3 text-sm text-content-secondary">Buscando postes…</p> : results.length ? results.map((pole) => {
            const added = selected.some((item) => item.id === pole.id);
            return <button key={pole.id} type="button" onClick={() => addPole(pole)} disabled={added || busy} className="flex w-full items-center justify-between gap-3 border-b border-edge-subtle p-3 text-left last:border-0 hover:bg-surface-subtle disabled:opacity-60">
              <span className="min-w-0"><strong className="block text-sm">{displayNumber(pole)}</strong><span className="block truncate text-xs text-content-secondary">{pole.address || 'Endereço não informado'} · {pole.lamp_type || 'Lâmpada não informada'}{pole.lamp_power_w ? ` · ${pole.lamp_power_w} W` : ''}</span></span>
              <span className="shrink-0 text-xs font-semibold text-brand">{added ? 'Adicionado' : <><Plus className="inline h-4 w-4" /> Adicionar</>}</span>
            </button>;
          }) : <p className="p-3 text-sm text-content-secondary">Nenhum poste encontrado com esse número.</p>}
        </div>}
      </section>
      <section className="space-y-2"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Postes para atualizar</h3><span className="text-xs text-content-secondary">{selected.length} de 1000</span></div>
        {selected.length ? <ul className="max-h-64 space-y-2 overflow-y-auto" aria-label="Postes selecionados">{selected.map((pole) => <li key={pole.id} className="flex items-center justify-between gap-3 rounded-lg border border-edge-subtle p-3"><span className="min-w-0"><strong className="block text-sm">{displayNumber(pole)}</strong><span className="block truncate text-xs text-content-secondary">{pole.address || 'Endereço não informado'}</span></span><button type="button" onClick={() => removePole(pole.id)} disabled={busy} aria-label={`Remover poste ${displayNumber(pole)}`} className="rounded-lg p-2 text-content-secondary hover:bg-surface-subtle hover:text-danger"><X className="h-4 w-4" /></button></li>)}</ul> : <p className="rounded-lg border border-dashed border-edge-default p-4 text-sm text-content-secondary">Pesquise e adicione os postes que receberão a nova lâmpada.</p>}
      </section>
      <label className="block text-sm font-semibold">Novo tipo de lâmpada<select value={lamp} onChange={(event) => { setLamp(event.target.value); setPreview(null); }} className="mt-2 h-10 w-full rounded-lg border border-edge-default bg-surface-raised px-3 text-sm">{LAMP_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      <label className="block text-sm font-semibold">Nova potência (W)<Input type="number" min="0.01" step="0.01" value={power} onChange={(event) => { setPower(event.target.value); setPreview(null); }} className="mt-2" /></label>
      {preview && <p role="status" className="rounded-lg bg-brand-subtleBg p-3 text-sm font-semibold text-brand">{preview.matched} postes conferidos. Tipo e potência serão alterados em todos eles.</p>}
      {error && <p role="alert" className="rounded-lg bg-danger-subtleBg p-3 text-sm text-danger">{error}</p>}
    </div>
  </MunicipalDrawer>;
}
