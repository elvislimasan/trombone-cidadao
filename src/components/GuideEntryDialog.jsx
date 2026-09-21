import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building, Send, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogHeader, DialogTitle, FormDialogContent, FormDialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError } from '@/lib/appError';
import { optimizeImageFile } from '@/lib/optimizeImage';

import GuideCategorySelect from '@/components/GuideCategorySelect';
import GuideTransportFields from '@/components/GuideTransportFields';
import { isGuideTransport } from '@/lib/guideCategories';
const emptyEntry = { name: '', address: '', phone: '', category_id: null, category_ids: [], guide_metadata: {}, photo: null, photoPreview: null };

export default function GuideEntryDialog({ open, onOpenChange, userId, cityId, cities, categories, initialCategoryId, onSubmitted }) {
  const [entry, setEntry] = useState(emptyEntry);
  const [selectedCityId, setSelectedCityId] = useState(cityId || '');
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef(null);
  const effectiveCityId = selectedCityId || cityId;

  useEffect(() => {
    if (!open) return;
    setSelectedCityId(cityId || '');
    setEntry({ ...emptyEntry, category_id: initialCategoryId || null, category_ids: initialCategoryId ? [initialCategoryId] : [] });
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
        phone: entry.phone.trim(),
        type: 'commerce',
        category_id: entry.category_id,
        category_ids: entry.category_ids,
        guide_metadata: entry.guide_metadata,
        city_id: effectiveCityId,
        submitted_by: userId,
        status: 'pending',
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
        <DialogDescription>Ajude a mapear os locais importantes da cidade. O cadastro será publicado após moderação.</DialogDescription>
      </DialogHeader>
      <form id="guide-entry-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-2"><Label htmlFor="guide-entry-name">Nome do local</Label><Input id="guide-entry-name" value={entry.name} onChange={(event) => setEntry((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Igreja Matriz ou Mercado Central" required /></div>
        <div className="grid gap-2"><Label htmlFor="guide-entry-address">Endereço</Label><Input id="guide-entry-address" value={entry.address} onChange={(event) => setEntry((current) => ({ ...current, address: event.target.value }))} placeholder="Ex.: Rua Principal, 123" required /></div>
        <div className="grid gap-2"><Label htmlFor="guide-entry-phone">Telefone</Label><Input id="guide-entry-phone" value={entry.phone} onChange={(event) => setEntry((current) => ({ ...current, phone: event.target.value }))} placeholder="(87) 99999-8888" required /></div>
        {!cityId && <div className="grid gap-2"><Label htmlFor="guide-entry-city">Cidade</Label><select id="guide-entry-city" value={selectedCityId} onChange={(event) => { setSelectedCityId(event.target.value); setEntry((current) => ({ ...current, category_id: null, category_ids: [] })); }} className="h-10 rounded-md border border-edge-subtle bg-surface-raised px-3 text-sm" required><option value="">Selecione a cidade</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}{city.state?.uf ? ` · ${city.state.uf}` : ''}</option>)}</select></div>}
        <div className="grid gap-2"><Label>Categorias</Label><GuideCategorySelect options={categoryOptions} value={entry.category_ids} onChange={(value) => setEntry((current) => ({ ...current, category_ids: value, category_id: value[0] || null }))} /></div>
        {isGuideTransport(entry, categories) && <GuideTransportFields value={entry.guide_metadata} onChange={(value) => setEntry((current) => ({ ...current, guide_metadata: value }))} />}
        <div className="grid gap-2"><Label>Foto do local (opcional)</Label><div className="flex items-center gap-4">{entry.photoPreview ? <img src={entry.photoPreview} alt="Prévia da foto" className="h-20 w-20 rounded-lg border object-cover" /> : <span className="flex h-20 w-20 items-center justify-center rounded-lg bg-surface-subtle text-content-tertiary"><Building className="h-7 w-7" /></span>}<Button type="button" variant="outline" onClick={() => photoInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Enviar foto</Button><input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" /></div></div>
      </form>
      <FormDialogFooter><Button type="button" variant="outline" disabled={submitting} onClick={() => handleOpenChange(false)}>Cancelar</Button><Button type="submit" form="guide-entry-form" disabled={submitting} className="gap-2"><Send className="h-4 w-4" />{submitting ? 'Enviando...' : 'Enviar para moderação'}</Button></FormDialogFooter>
    </FormDialogContent>
  </Dialog>;
}
