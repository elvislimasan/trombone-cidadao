import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { polePosition } from '@/lib/poleAddress';

export default function PoleCoordinateFields({ position, disabled, onApply, onPendingChange }) {
  const [draft, setDraft] = useState({ latitude: '', longitude: '' });
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDraft({ latitude: position?.lat == null ? '' : String(position.lat), longitude: position?.lng == null ? '' : String(position.lng) });
    setDirty(false);
    onPendingChange(false);
  }, [position?.lat, position?.lng, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const parsed = polePosition({ latitude: draft.latitude.replace(',', '.'), longitude: draft.longitude.replace(',', '.') });
  const update = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirty(true);
    onPendingChange(true);
  };
  return <div className="shrink-0">
    <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      {[['latitude', 'Latitude'], ['longitude', 'Longitude']].map(([field, label]) => <label key={field} className="min-w-0 text-xs font-semibold" htmlFor={`pole-${field}`}>{label}<Input id={`pole-${field}`} className="mt-1 min-w-0" inputMode="decimal" value={draft[field]} onChange={(event) => update(field, event.target.value)} disabled={disabled} /></label>)}
      <Button type="button" variant="outline" className="col-span-2 sm:col-span-1" disabled={disabled || !dirty || !parsed} onClick={() => { onApply(parsed); setDirty(false); onPendingChange(false); }}>Atualizar pin</Button>
    </div>
    <p role={dirty ? 'status' : undefined} className="mt-1 text-xs text-content-secondary">{dirty && !parsed ? 'Informe latitude entre −90 e 90 e longitude entre −180 e 180.' : dirty ? 'Clique em “Atualizar pin” para aplicar as coordenadas antes de salvar.' : 'Arraste o pin ou informe coordenadas. Confira o endereço antes de salvar.'}</p>
  </div>;
}
