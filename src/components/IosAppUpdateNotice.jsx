import React, { useEffect, useRef, useState } from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { APP_STORE_APP_ID, APP_STORE_DEEPLINK } from '@/config/storeLinks';
import { createIosUpdateChecker, IOS_UPDATE_DISMISS_KEY } from '@/lib/iosAppUpdate';

export default function IosAppUpdateNotice() {
  const [update, setUpdate] = useState(null);
  const checker = useRef(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios' || !APP_STORE_APP_ID) return;
    const controller = createIosUpdateChecker({
      appId: APP_STORE_APP_ID,
      getInfo: () => App.getInfo(),
      lookup: async id => {
        // Native HTTP avoids WebView CORS restrictions. No global fetch patch.
        const response = await CapacitorHttp.get({ url: 'https://itunes.apple.com/lookup',
          params: { id, country: 'br' }, responseType: 'json', connectTimeout: 8000, readTimeout: 8000 });
        if (response.status !== 200) throw new Error('App Store indisponível');
        return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      },
      readDismissal: async () => {
        const { value } = await Preferences.get({ key: IOS_UPDATE_DISMISS_KEY });
        return value ? JSON.parse(value) : null;
      },
      writeDismissal: value => Preferences.set({ key: IOS_UPDATE_DISMISS_KEY, value: JSON.stringify(value) }),
      onAvailable: setUpdate,
    });
    checker.current = controller;
    void controller.check();
    const listener = App.addListener('appStateChange', ({ isActive }) => { if (isActive) void controller.check(); }).catch(() => null);
    return () => {
      controller.dispose();
      checker.current = null;
      void listener.then(handle => handle?.remove()).catch(() => {});
    };
  }, []);

  const dismiss = () => {
    if (update) void checker.current?.dismiss(update.version);
    setUpdate(null);
  };

  if (!update) return null;
  return <Dialog open onOpenChange={open => { if (!open) dismiss(); }}>
    <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-xl">
      <DialogHeader>
        <DialogTitle>Atualização disponível</DialogTitle>
        <DialogDescription>Versão {update.version} disponível na App Store.</DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button variant="outline" onClick={dismiss}>Agora não</Button>
        <Button asChild><a href={APP_STORE_DEEPLINK} onClick={dismiss}>Atualizar</a></Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
