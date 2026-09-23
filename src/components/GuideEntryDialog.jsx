import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Building, MapPin, Send, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogHeader, DialogTitle, FormDialogContent, FormDialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError } from '@/lib/appError';
import { optimizeImageFile } from '@/lib/optimizeImage';

import GuideCategorySelect from '@/components/GuideCategorySelect';
import GuideTransportFields from '@/components/GuideTransportFields';
import GuidePhoneFields from '@/components/GuidePhoneFields';
import { isGuideTransport } from '@/lib/guideCategories';
const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));
const emptyEntry = { name: '', address: '', phones: [''], location: null, category_id: null, category_ids: [], guide_metadata: {}, photo: null, photoPreview: null };

export default function GuideEntryDialog({ open, onOpenChange, userId, cityId, cities, categories, initialCategoryId, onSubmitted, approveImmediately = false }) {
  const [entry, setEntry] = useState(emptyEntry);
  const [selectedCityId, setSelectedCityId] = useState(cityId || '');
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef(null);
  const addressTouchedRef = useRef(false);
  const reverseRequestRef = useRef(0);
  const effectiveCityId = selectedCityId || cityId;

  useEffect(() => {
    if (!open) return;
    setSelectedCityId(cityId || '');
    setEntry({ ...emptyEntry, category_id: initialCategoryId || null, category_ids: initialCategoryId ? [initialCategoryId] : [] });
    addressTouchedRef.current = false;
  }, [open, cityId, initialCategoryId]);

  useEffect(() => () => {
    if (entry.photoPreview) URL.revokeObjectURL(entry.photoPreview);
  }, [entry.photoPreview]);

  const categoryOptions = useMemo(() => categories
    .filter((category) => category.city_id == null || String(category.city_id) === String(effectiveCityId))
    .map((category) => {
      const parent = categories.find((item) => String(item.id) === String(category.parent_id));
      return { value: category.id, label: `${parent ? `${parent.name} · ` : ''}${category.name}` };
    }), [categories, effectiveCityId]);
  const selectedCity = cities.find((city) => String(city.id) === String(effectiveCityId));

  const handleLocationChange = async (location) => {
    setEntry((current) => ({ ...current, location }));
    if (!location || addressTouchedRef.current) return;
    const requestId = ++reverseRequestRef.current;
    const { data, error } = await supabase.functions.invoke('reverse-geocode', {
      body: { lat: location.lat, lng: location.lng, zoom: 18 },
    });
    if (error || requestId !== reverseRequestRef.current || addressTouchedRef.current) return;
    if (typeof data?.address === 'string' && data.address.trim()) {
      setEntry((current) => ({ ...current, address: data.address.trim() }));
    }
  };

  const handleOpenChange = (nextOpen) => {
    if (submitting) return;
    onOpenChange(nextOpen);
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showAppError({ title: 'Selecione uma imagem', description: 'O arquivo precisa ser uma foto.', variant: 'destructive' });
      return;
    }
    setEntry((current) => ({ ...current, photo: file, photoPreview: URL.createObjectURL(file) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!userId) return;
    if (!effectiveCityId) {
      showAppError({ title: 'Selecione uma cidade', description: 'Escolha a cidade do local antes de enviar.', variant: 'destructive' });
      return;
    }
    if (!entry.category_id) {
      showAppError({ title: 'Selecione uma categoria', description: 'Escolha onde o local aparece no guia.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl = null;
      if (entry.photo) {
        const uploadFile = await optimizeImageFile(entry.photo);
        const filePath = `${userId}/${crypto.randomUUID()}-${uploadFile.name}`;
        const { error: uploadError } = await supabase.storage.from('city-guide-submissions').upload(filePath, uploadFile);
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from('city-guide-submissions').getPublicUrl(filePath).data.publicUrl;
      }

      const { error } = await supabase.from('directory').insert({
        name: entry.name.trim(),
        address: entry.address.trim(),
        phone: entry.phones.map((phone) => phone.trim()).filter(Boolean)[0] || '',
        type: 'commerce',
        category_id: entry.category_id,
        category_ids: entry.category_ids,
        guide_metadata: { ...entry.guide_metadata, phones: entry.phones.map((phone) => phone.trim()).filter(Boolean) },
        location: entry.location ? `POINT(${entry.location.lng} ${entry.location.lat})` : null,
        city_id: effectiveCityId,
        submitted_by: userId,
        status: approveImmediately ? 'approved' : 'pending',
        ...(imageUrl ? { image_url: imageUrl } : {}),
      });
      if (error) throw error;
      setEntry(emptyEntry);
      onOpenChange(false);
      onSubmitted?.();
    } catch (error) {
      showAppError({ title: 'Não foi possível enviar o local', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return <Dialog open={open} onOpenChange={handleOpenChange}>
    <FormDialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Adicionar ao Guia da Cidade</DialogTitle>
        <DialogDescription>{approveImmediately ? 'Cadastre um local e publique diretamente no Guia da Cidade.' : 'Ajude a mapear os locais importantes da cidade. O cadastro será publicado após moderação.'}</DialogDescription>
      </DialogHeader>
      <form id="guide-entry-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-2"><Label htmlFor="guide-entry-name">Nome do local</Label><Input id="guide-entry-name" value={entry.name} onChange={(event) => setEntry((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Igreja Matriz ou Mercado Central" required /></div>
        <div className="grid gap-2"><Label htmlFor="guide-entry-address">Endereço</Label><Input id="guide-entry-address" value={entry.address} onChange={(event) => { addressTouchedRef.current = true; setEntry((current) => ({ ...current, address: event.target.value })); }} placeholder="Marque o pino ou digite o endereço" required /></div>
        <GuidePhoneFields phones={entry.phones} onChange={(phones) => setEntry((current) => ({ ...current, phones }))} required />
        {!cityId && <div className="grid gap-2"><Label htmlFor="guide-entry-city">Cidade</Label><select id="guide-entry-city" value={selectedCityId} onChange={(event) => { setSelectedCityId(event.target.value); setEntry((current) => ({ ...current, category_id: null, category_ids: [] })); }} className="h-10 rounded-md border border-edge-subtle bg-surface-raised px-3 text-sm" required><option value="">Selecione a cidade</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}{city.state?.uf ? ` · ${city.state.uf}` : ''}</option>)}</select></div>}
        <div className="grid gap-2"><Label>Categorias</Label><GuideCategorySelect options={categoryOptions} value={entry.category_ids} onChange={(value) => setEntry((current) => ({ ...current, category_ids: value, category_id: value[0] || null }))} /></div>
        {isGuideTransport(entry, categories) && <GuideTransportFields value={entry.guide_metadata} onChange={(value) => setEntry((current) => ({ ...current, guide_metadata: value }))} />}
        <div className="grid gap-2"><Label>Localização no mapa</Label><div className="h-64 overflow-hidden rounded-xl border border-edge-subtle"><Suspense fallback={<div className="h-full animate-pulse bg-muted" />}><LocationPickerMap key={effectiveCityId || 'city'} initialPosition={entry.location} onLocationChange={handleLocationChange} fallbackCityCenter={selectedCity ? { name: selectedCity.name, uf: selectedCity.state?.uf } : null} showLocateButton showMarker={Boolean(entry.location)} initialZoom={16} /></Suspense></div><p className="flex items-center gap-1.5 text-xs text-content-tertiary"><MapPin className="h-3.5 w-3.5" /> Ao marcar o pino, o endereço é preenchido automaticamente.</p></div>
        <div className="grid gap-2"><Label>Foto do local (opcional)</Label><div className="flex items-center gap-4">{entry.photoPreview ? <img src={entry.photoPreview} alt="Prévia da foto" className="h-20 w-20 rounded-lg border object-cover" /> : <span className="flex h-20 w-20 items-center justify-center rounded-lg bg-surface-subtle text-content-tertiary"><Building className="h-7 w-7" /></span>}<Button type="button" variant="outline" onClick={() => photoInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Enviar foto</Button><input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" /></div></div>
      </form>
      <FormDialogFooter><Button type="button" variant="outline" disabled={submitting} onClick={() => handleOpenChange(false)}>Cancelar</Button><Button type="submit" form="guide-entry-form" disabled={submitting} className="gap-2"><Send className="h-4 w-4" />{submitting ? 'Salvando...' : approveImmediately ? 'Publicar no guia' : 'Enviar para moderação'}</Button></FormDialogFooter>
    </FormDialogContent>
  </Dialog>;
}
