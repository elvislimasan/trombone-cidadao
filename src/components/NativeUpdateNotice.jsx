import React, { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Download } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'native-update-dismissed-build';
const EVENT_NAME = 'native-update-notice-state';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const asInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const getPlayStoreUrl = (applicationId) =>
  `https://play.google.com/store/apps/details?id=${encodeURIComponent(applicationId)}`;

export default function NativeUpdateNotice() {
  const [open, setOpen] = useState(false);
  const [force, setForce] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');
  const [latest, setLatest] = useState(null);
  const [current, setCurrent] = useState(null);

  const dismissState = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || '';
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const build = asInt(parsed.build);
        const ts = asInt(parsed.ts);
        if (build && ts) return { build, ts };
      }
      const build = asInt(raw);
      if (build) return { build, ts: 0 };
      return null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    const run = async () => {
      const publish = (next) => {
        try {
          window.__nativeUpdateNoticeState = next;
          window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
        } catch {}
      };

      publish({ checked: false, open: false });

      const info = await App.getInfo();
      const currentBuild = asInt(info.build);
      if (!currentBuild) {
        publish({ checked: true, open: false });
        return;
      }

      const { data } = await supabase
        .from('site_config')
        .select('app_update_settings')
        .eq('id', 1)
        .single();

      const s = data?.app_update_settings || {};
      const enabled = s.enabled !== false;
      if (!enabled) {
        publish({ checked: true, open: false });
        return;
      }

      const latestBuild = asInt(s.latest_android_version_code);
      const minBuild = asInt(s.min_android_version_code);
      if (!latestBuild || latestBuild <= currentBuild) {
        publish({ checked: true, open: false });
        return;
      }

      const nextForce = Boolean(minBuild && currentBuild < minBuild);
      const url =
        s.play_store_url ||
        getPlayStoreUrl(s.android_application_id || 'com.trombonecidadao.app');

      if (cancelled) return;

      setCurrent(currentBuild);
      setLatest(latestBuild);
      setForce(nextForce);
      setStoreUrl(url);

      if (!nextForce && dismissState?.build === latestBuild) {
        const ts = dismissState.ts || 0;
        if (ts && Date.now() - ts < DISMISS_COOLDOWN_MS) {
          publish({ checked: true, open: false });
          return;
        }
      }
      setOpen(true);
      publish({ checked: true, open: true });
    };

    run().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [dismissState]);

  if (!Capacitor.isNativePlatform()) return null;
  if (!open || !latest || !current) return null;

  const handleUpdate = async () => {
    if (!storeUrl) return;
    try {
      await Browser.open({ url: storeUrl });
    } catch {
      try {
        window.open(storeUrl, '_blank', 'noopener,noreferrer');
      } catch {}
    }
  };

  const handleLater = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ build: latest, ts: Date.now() }));
    } catch {}
    try {
      window.__nativeUpdateNoticeState = { checked: true, open: false };
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { checked: true, open: false } }));
    } catch {}
    setOpen(false);
  };

  return (
    <div className="fixed left-0 right-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px)+1rem)] z-[1200] px-4">
      <div className="w-full max-w-xl mx-auto rounded-3xl border border-border bg-background shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <Download className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-foreground">Nova atualização disponível</p>
            <p className="text-xs text-muted-foreground">
              Atualize agora para receber melhorias de estabilidade, desempenho e novos ajustes no app.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          {!force && (
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-full px-4"
              onClick={handleLater}
            >
              Depois
            </Button>
          )}
          <Button
            type="button"
            className="h-9 rounded-full bg-red-500 px-4 hover:bg-red-600"
            onClick={handleUpdate}
          >
            Atualizar
          </Button>
        </div>
      </div>
    </div>
  );
}
