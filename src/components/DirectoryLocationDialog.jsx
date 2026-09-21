import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogDescription, DialogHeader, DialogTitle, FormDialogContent } from '@/components/ui/dialog';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';
import { guideLocation } from '@/lib/guideLocation';
import { saveGuideLocation } from '@/lib/saveGuideLocation';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

export default function DirectoryLocationDialog({ open, onOpenChange, item, onSaved }) {
  const { cities } = useCity();
  const [position, setPosition] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPosition(guideLocation(item.location) || guideLocation(item.address));
      setError('');
    }
  }, [open, item]);

  const city = cities.find((entry) => String(entry.id) === String(item.city_id));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await saveGuideLocation(supabase, item.id, position);
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a localização.');
      setSaving(false);
      return;
    }
    setSaving(false);
    onOpenChange(false);
    await onSaved?.();
  };

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
    <FormDialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Localização de {item.name}</DialogTitle>
        <DialogDescription>Clique no mapa para marcar o local ou arraste o pino. Depois, salve para publicar a localização.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="grid gap-4">
        <div className="isolate h-[min(50dvh,24rem)] overflow-hidden rounded-xl border" style={saving ? { pointerEvents: 'none' } : undefined}>
          <Suspense fallback={<div className="flex h-full items-center justify-center bg-muted">Carregando mapa...</div>}>
            <LocationPickerMap initialPosition={position} onLocationChange={setPosition} showMarker={Boolean(position)} showLocateButton initialZoom={16} fallbackCityCenter={city ? { name: city.name, uf: city.state?.uf } : null} />
          </Suspense>
        </div>
        <p className="text-sm text-content-secondary" aria-live="polite">{position ? `Ponto selecionado: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}` : 'Nenhum ponto selecionado. Clique no mapa para adicionar.'}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild><Button type="button" variant="outline" disabled={saving}>Cancelar</Button></DialogClose>
          <Button type="submit" disabled={saving || !position} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Salvando...' : 'Salvar localização'}</Button>
        </div>
      </form>
    </FormDialogContent>
  </Dialog>;
}
