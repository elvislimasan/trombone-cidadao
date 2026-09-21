import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CityCombobox from '@/components/CityCombobox';
import GuideCategorySelect from '@/components/GuideCategorySelect';
import GuideTransportFields from '@/components/GuideTransportFields';
import { Dialog, DialogClose, DialogHeader, DialogTitle, FormDialogContent, FormDialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError } from '@/lib/appError';
import { guideCategoryIds, isGuideTransport } from '@/lib/guideCategories';
import { guideLocation } from '@/lib/guideLocation';
import { normalizarInstagram } from '@/lib/externalLinks';
import { optimizeImageFile } from '@/lib/optimizeImage';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const itemPosition = (item) => guideLocation(item.address) || guideLocation(item.location);

const editableItem = (item) => ({
  name: item.name || '',
  description: item.description || '',
  address: item.address || '',
  phone: item.phone || '',
  instagram_url: item.instagram_url || '',
  city_id: item.city_id || '',
  category_id: item.category_id || null,
  category_ids: guideCategoryIds(item),
  guide_metadata: item.guide_metadata || {},
  image_url: item.image_url || '',
});

export default function DirectoryEditDialog({ open, onOpenChange, item, categories, allowedCityIds, onSaved }) {
  const { cities } = useCity();
  const [form, setForm] = useState(() => editableItem(item));
  const [position, setPosition] = useState(() => itemPosition(item));
  const [mapRevision, setMapRevision] = useState(0);
  const [mainFile, setMainFile] = useState(null);
  const [secondaryFile, setSecondaryFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const mainInput = useRef(null);
  const secondaryInput = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm(editableItem(item));
    setPosition(itemPosition(item));
    setMapRevision((revision) => revision + 1);
    setMainFile(null);
    setSecondaryFile(null);
  }, [item, open]);

  const categoryOptions = useMemo(() => {
    const byId = new Map(categories.map((category) => [String(category.id), category]));
    return [...categories]
      .sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0) || a.name.localeCompare(b.name, 'pt-BR'))
      .map((category) => ({
        value: category.id,
        label: `${category.parent_id ? `${byId.get(String(category.parent_id))?.name || 'Categoria'} · ` : ''}${category.name}`,
      }));
  }, [categories]);

  const selectedCity = cities.find((city) => String(city.id) === String(form.city_id));
  const fallbackCityCenter = selectedCity ? { name: selectedCity.name, uf: selectedCity.state?.uf } : null;
  const mainPreview = useMemo(() => mainFile ? URL.createObjectURL(mainFile) : form.image_url, [mainFile, form.image_url]);
  const secondaryPreview = useMemo(() => secondaryFile ? URL.createObjectURL(secondaryFile) : form.guide_metadata?.secondary_image_url, [secondaryFile, form.guide_metadata?.secondary_image_url]);

  useEffect(() => () => {
    if (mainFile && mainPreview) URL.revokeObjectURL(mainPreview);
  }, [mainFile, mainPreview]);

  useEffect(() => () => {
    if (secondaryFile && secondaryPreview) URL.revokeObjectURL(secondaryPreview);
  }, [secondaryFile, secondaryPreview]);

  const upload = async (file, prefix) => {
    const optimized = await optimizeImageFile(file);
    const path = `directory/${prefix}-${crypto.randomUUID()}-${optimized.name}`;
    const { error } = await supabase.storage.from('work-media').upload(path, optimized);
    if (error) throw error;
    return supabase.storage.from('work-media').getPublicUrl(path).data.publicUrl;
  };

  const handleAddressChange = (event) => {
    const address = event.target.value;
    setForm((current) => ({ ...current, address }));
    const linkedPosition = guideLocation(address);
    if (linkedPosition) {
      setPosition(linkedPosition);
      // O Leaflet conserva a viewport depois de montado. Remontar somente
      // quando um link valido e colado faz o mapa ir ao novo ponto.
      setMapRevision((revision) => revision + 1);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.city_id || form.category_ids.length === 0) {
      showAppError({ title: 'Preencha nome, cidade e ao menos uma categoria', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const location = guideLocation(position);
      const imageUrl = mainFile ? await upload(mainFile, 'principal') : form.image_url || null;
      const secondaryUrl = secondaryFile ? await upload(secondaryFile, 'secundaria') : form.guide_metadata?.secondary_image_url || null;
      const changes = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        address: form.address.trim(),
        phone: form.phone.trim(),
        instagram_url: normalizarInstagram(form.instagram_url) || null,
        city_id: form.city_id,
        category_id: form.category_ids[0],
        category_ids: form.category_ids,
        guide_metadata: { ...form.guide_metadata, secondary_image_url: secondaryUrl },
        image_url: imageUrl,
        location: location ? `POINT(${location.lng} ${location.lat})` : null,
      };
      const { data, error } = await supabase.from('directory').update(changes).eq('id', item.id).select('id, location').single();
      if (error) throw error;
      const savedLocation = guideLocation(data?.location);
      if (location && (!savedLocation || Math.abs(savedLocation.lat - location.lat) > 1e-7 || Math.abs(savedLocation.lng - location.lng) > 1e-7)) {
        throw new Error('A localização retornada pelo servidor não corresponde ao ponto marcado.');
      }
      onOpenChange(false);
      await onSaved?.();
    } catch (error) {
      showAppError({ title: 'Não foi possível salvar o local', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
    <FormDialogContent className="grid h-[94dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-w-2xl">
      <DialogHeader className="border-b border-edge-subtle px-5 py-4 pr-12 sm:px-6">
        <DialogTitle>Editar local</DialogTitle>
        <p className="text-sm text-content-tertiary">As mudanças aparecem imediatamente no Guia da Cidade.</p>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
        <div className="grid min-h-0 content-start gap-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-2"><Label htmlFor="directory-name">Nome</Label><Input id="directory-name" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} required /></div>
          <div className="grid gap-2"><Label htmlFor="directory-description">Descrição</Label><Textarea id="directory-description" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} rows={4} /></div>
          <div className="grid gap-2"><Label>Categorias</Label><GuideCategorySelect options={categoryOptions} value={form.category_ids} onChange={(ids) => setForm((current) => ({ ...current, category_ids: ids, category_id: ids[0] || null }))} /></div>
          <div className="grid gap-2"><Label>Cidade</Label><CityCombobox modal value={form.city_id} allowedCityIds={allowedCityIds} onChange={(city_id) => setForm((current) => ({ ...current, city_id }))} /></div>
          {isGuideTransport(form, categories) && <GuideTransportFields value={form.guide_metadata} onChange={(guide_metadata) => setForm((current) => ({ ...current, guide_metadata }))} />}
          <div className="grid gap-2"><Label htmlFor="directory-address">Endereço</Label><Input id="directory-address" value={form.address} onChange={handleAddressChange} /><p className="text-xs text-muted-foreground">Ao colar um link do Google Maps, o pino vai automaticamente para o local indicado.</p></div>
          <div className="grid gap-2"><Label>Localização no mapa</Label><div className="h-64 overflow-hidden rounded-xl border"><Suspense fallback={<div className="h-full animate-pulse bg-muted" />}><LocationPickerMap key={`${form.city_id || 'city'}-${mapRevision}`} initialPosition={position} onLocationChange={setPosition} fallbackCityCenter={fallbackCityCenter} showLocateButton showMarker={Boolean(position)} initialZoom={16} /></Suspense></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="directory-phone">Telefone</Label><Input id="directory-phone" value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} /></div><div className="grid gap-2"><Label htmlFor="directory-instagram">Instagram</Label><Input id="directory-instagram" value={form.instagram_url} onChange={(e) => setForm((current) => ({ ...current, instagram_url: e.target.value }))} placeholder="@empresa" /></div></div>
          <ImageField label="Imagem principal" preview={mainPreview} inputRef={mainInput} onFile={setMainFile} onRemove={() => { setMainFile(null); setForm((current) => ({ ...current, image_url: '' })); }} />
          <ImageField label="Imagem secundária" preview={secondaryPreview} inputRef={secondaryInput} onFile={setSecondaryFile} onRemove={() => { setSecondaryFile(null); setForm((current) => ({ ...current, guide_metadata: { ...current.guide_metadata, secondary_image_url: null } })); }} />
        </div>
        <FormDialogFooter className="border-t bg-surface-raised px-5 py-4 sm:px-6">
          <DialogClose asChild><Button type="button" variant="outline" disabled={saving}>Cancelar</Button></DialogClose>
          <Button type="submit" disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Salvando...' : 'Salvar alterações'}</Button>
        </FormDialogFooter>
      </form>
    </FormDialogContent>
  </Dialog>;
}

function ImageField({ label, preview, inputRef, onFile, onRemove }) {
  return <div className="grid gap-2"><Label>{label}</Label><div className="flex flex-wrap items-center gap-3">
    {preview ? <img src={preview} alt="Prévia" className="h-24 w-32 rounded-xl border bg-muted object-cover" /> : <div className="flex h-24 w-32 items-center justify-center rounded-xl border border-dashed bg-muted/40"><ImagePlus className="h-6 w-6 text-muted-foreground" /></div>}
    <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />Escolher imagem</Button>
    {preview && <Button type="button" variant="ghost" className="text-destructive" onClick={onRemove}><Trash2 className="mr-2 h-4 w-4" />Remover</Button>}
    <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
  </div></div>;
}
