import React, { useId, useState } from 'react';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LegislativeResponsivePanel from './LegislativeResponsivePanel';

export default function LegislativeCityPicker({ cityId, cities, onChange }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const labelId = useId();
  const current = cities.find(city => String(city.id) === String(cityId));
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matches = cities.filter(city => normalize(`${city.name} ${city.state?.uf || ''}`).includes(normalize(search)));
  const visible = !search && current ? [current, ...matches.filter(city => city.id !== current.id)].slice(0, 60) : matches.slice(0, 60);
  return <LegislativeResponsivePanel title="Escolher cidade" open={open} onOpenChange={value => { setOpen(value);if (!value) setSearch(''); }} className="legislative-city-panel" trigger={<Button variant="outline" className="legislative-city-button" aria-label="Escolher cidade" aria-describedby={labelId}><MapPin size={16} /><span id={labelId}>{current?.name || `Cidade ${cityId}`}{current?.state?.uf ? ` · ${current.state.uf}` : ''}</span><ChevronDown size={14} /></Button>}>
    <label className="legislative-field">Cidade<input placeholder="Buscar cidade" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <div className="legislative-city-options">{visible.map(city => <button type="button" key={city.id} aria-current={String(city.id) === String(cityId) ? 'true' : undefined} onClick={() => { setOpen(false);onChange(city.id); }}><span>{city.name}{city.state?.uf ? ` · ${city.state.uf}` : ''}</span>{String(city.id) === String(cityId) && <Check size={17} />}</button>)}{!matches.length && <p className="py-3 text-sm text-content-secondary">Nenhuma cidade encontrada.</p>}{matches.length > 60 && <p className="py-3 text-xs text-content-secondary">Digite o nome para encontrar outras cidades.</p>}</div>
  </LegislativeResponsivePanel>;
}
