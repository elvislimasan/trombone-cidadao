import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'tc_theme_preference';
const VALID = new Set(['light', 'dark']);

const normalize = (value) => (VALID.has(value) ? value : 'light');

export async function loadThemePreference() {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Preferences')) {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      return normalize(value);
    }
  } catch {}
  try {
    return normalize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'light';
  }
}

export async function saveThemePreference(preference) {
  const pref = normalize(preference);
  // Grava sempre no localStorage: o script inline do index.html le dele
  // para evitar flash antes do React montar.
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {}
  try {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Preferences')) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: STORAGE_KEY, value: pref });
    }
  } catch {}
}

export { STORAGE_KEY };
