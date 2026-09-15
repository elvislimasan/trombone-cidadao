import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError } from '@/lib/appError';
import { useCity } from '@/contexts/CityContext';
import { optimizeImageFile } from '@/lib/optimizeImage';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function CityThumbnailManager({ city, onSaved }) {
  const inputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const { updateCity } = useCity();
  const [imageUrl, setImageUrl] = useState(() => city?.civic_thumbnail_url || city?.cover_url || city?.image_url || null);

  useEffect(() => {
    setImageUrl(city?.civic_thumbnail_url || city?.cover_url || city?.image_url || null);
  }, [city?.id, city?.civic_thumbnail_url, city?.cover_url, city?.image_url]);

  const save = async (url, path = null) => {
    const { error } = await supabase.rpc('set_city_civic_thumbnail', {
      p_city_id: Number(city.id), p_url: url || '', p_path: path || '',
    });
    if (error) throw error;
    const changes = { civic_thumbnail_url: url || null, civic_thumbnail_path: path || null };
    const nextCity = { ...city, ...changes };
    setImageUrl(url || null);
    updateCity(city.id, changes);
    onSaved?.(nextCity);
  };

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !city?.id) return;
    if (!ALLOWED.has(file.type) || file.size > 5 * 1024 * 1024) {
      showAppError({ title: 'Imagem inválida', description: 'Envie JPG, PNG ou WebP de até 5 MB.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const uploadFile = await optimizeImageFile(file, { maxDimension: 1600, quality: 0.84 });
      const extension = uploadFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${city.id}/thumbnail-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('city-media').upload(path, uploadFile, { upsert: false, contentType: uploadFile.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('city-media').getPublicUrl(path);
      await save(data.publicUrl, path);
      showAppError({ title: 'Imagem da cidade atualizada', description: 'Ela já aparece nos destaques da cidade.' });
    } catch (error) {
      showAppError({ title: 'Não foi possível enviar a imagem', description: error.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await save(null, null);
      if (city?.civic_thumbnail_path) await supabase.storage.from('city-media').remove([city.civic_thumbnail_path]);
      showAppError({ title: 'Imagem removida' });
    } catch (error) {
      showAppError({ title: 'Não foi possível remover a imagem', description: error.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-surface-sunken">
          {imageUrl ? <img src={imageUrl} alt={`Imagem de ${city?.name || 'cidade'}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-content-tertiary"><ImagePlus className="h-5 w-5" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold text-content-primary">Imagem da cidade</h3>
          <p className="mt-1 text-xs leading-5 text-content-secondary">Usada no Radar, na home desktop e nos perfis públicos da cidade.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} className="hidden" />
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => inputRef.current?.click()} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {imageUrl ? 'Trocar imagem' : 'Enviar imagem'}
            </Button>
            {imageUrl && <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={remove} className="gap-2 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /> Remover</Button>}
          </div>
        </div>
      </div>
    </section>
  );
}
