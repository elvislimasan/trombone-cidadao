import { Capacitor } from '@capacitor/core';

export const isIOSNative = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

export const isAndroidNative = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
