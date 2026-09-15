import { supabase } from '@/lib/customSupabaseClient';

const BUCKET = 'card-instagram';

export function getCardInstagramPublicUrl(path) {
  try {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) return '';
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(normalizedPath);
    return data?.publicUrl || '';
  } catch {
    return '';
  }
}

