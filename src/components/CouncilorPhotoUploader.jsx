import { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Trash2, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { showAppError } from '@/lib/appError';
import { supabase } from '@/lib/customSupabaseClient';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const extensionFor = (file) => {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
};

export default function CouncilorPhotoUploader({ value, onChange, onUploadingChange, councilorId = 'novo', name = 'Vereador', disabled = false }) {
  const { user } = useAuth();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const selectFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      showAppError({ title: 'Formato de imagem não aceito', description: 'Escolha uma imagem JPG, PNG ou WebP.', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showAppError({ title: 'Imagem muito grande', description: 'Escolha uma imagem de até 5 MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    onUploadingChange?.(true);
    const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const safeCouncilorId = String(councilorId || 'novo').replace(/[^a-zA-Z0-9_-]/g, '');
    const path = `${user?.id || 'admin'}/councilors/${safeCouncilorId}-${uniqueId}.${extensionFor(file)}`;
    const { error } = await supabase.storage.from('profile-avatars').upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      setUploading(false);
      onUploadingChange?.(false);
      showAppError({ title: 'Não foi possível enviar a foto', description: error.message, variant: 'destructive' });
      return;
    }
    const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
    setUploading(false);
    onUploadingChange?.(false);
    if (!data?.publicUrl) {
      showAppError({ title: 'Não foi possível obter a foto enviada', variant: 'destructive' });
      return;
    }
    onChange(data.publicUrl);
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-edge-subtle bg-surface-subtle p-3 sm:flex-row sm:items-center">
      <span className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised text-content-tertiary">
        {value ? <img src={value} alt={`Foto de ${name}`} className="h-full w-full object-cover" /> : <User className="h-9 w-9" />}
        {uploading && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white"><Loader2 className="h-6 w-6 animate-spin" /></span>}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-content-primary">Foto do vereador</p>
        <p className="mt-1 text-xs leading-relaxed text-content-secondary">Use uma foto quadrada ou vertical em JPG, PNG ou WebP, com até 5 MB.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-2" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
            {value ? <Camera className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
            {value ? 'Trocar foto' : 'Enviar foto'}
          </Button>
          {value && <Button type="button" variant="ghost" size="sm" className="gap-2 text-destructive" disabled={disabled || uploading} onClick={() => onChange('')}><Trash2 className="h-4 w-4" /> Remover</Button>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={selectFile} disabled={disabled || uploading} />
    </div>
  );
}
