import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { uniqueChannelTopic } from '@/lib/utils';

export function useFeedRealtime() {
  const [newCount, setNewCount] = useState(0);
  const loadedAtRef = useRef(new Date().toISOString());

  useEffect(() => {
    const channel = supabase
      // Topico unico por instancia: canal com nome fixo colide entre abas
      // e entre montagens, e o Supabase descarta a inscricao duplicada.
      .channel(uniqueChannelTopic('feed-new-reports'))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reports',
          filter: `moderation_status=eq.approved`,
        },
        (payload) => {
          if (payload.new?.created_at >= loadedAtRef.current) {
            setNewCount((n) => n + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const resetNewCount = useCallback(() => {
    setNewCount(0);
    loadedAtRef.current = new Date().toISOString();
  }, []);

  return { newCount, resetNewCount };
}

export default useFeedRealtime;
