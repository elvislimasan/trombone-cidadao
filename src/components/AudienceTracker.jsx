import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

import { supabase } from '@/lib/customSupabaseClient';

let fallbackVisitorId = null;
let fallbackSessionId = null;
let lastTracked = { signature: '', at: 0 };

const randomUuid = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
};

const storedId = (storage, key, fallbackKey) => {
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const created = randomUuid();
    storage.setItem(key, created);
    return created;
  } catch {
    if (fallbackKey === 'visitor') fallbackVisitorId ||= randomUuid();
    if (fallbackKey === 'session') fallbackSessionId ||= randomUuid();
    return fallbackKey === 'visitor' ? fallbackVisitorId : fallbackSessionId;
  }
};

export default function AudienceTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname || '/';
    const now = Date.now();
    const signature = `${location.key || 'default'}:${path}`;
    // React StrictMode monta o efeito duas vezes no desenvolvimento. Isso não
    // pode virar duas visualizações no painel.
    if (lastTracked.signature === signature && now - lastTracked.at < 1500) return;
    lastTracked = { signature, at: now };

    const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
    const visitorId = storedId(window.localStorage, 'tc-audience-visitor', 'visitor');
    const sessionId = storedId(window.sessionStorage, 'tc-audience-session', 'session');

    supabase.rpc('track_audience_page_view', {
      p_event_id: randomUuid(),
      p_visitor_id: visitorId,
      p_session_id: sessionId,
      p_platform: platform,
      p_path: path.slice(0, 512),
    }).then(({ error }) => {
      // Analytics nunca pode interromper a navegação. Em ambientes onde a
      // migração ainda não foi aplicada, apenas deixa de contar.
      if (error && import.meta.env.DEV) console.debug('Audience tracking unavailable:', error.message);
    });
  }, [location.key, location.pathname]);

  return null;
}
