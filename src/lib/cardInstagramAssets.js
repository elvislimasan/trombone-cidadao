import { supabase } from '@/lib/customSupabaseClient';

const BUCKET = 'card-instagram';

export function getCardInstagramPublicUrl(path) {
  try {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || '';
  } catch {
    return '';
  }
}

