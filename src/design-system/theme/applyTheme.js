import { Capacitor } from '@capacitor/core';

// Precisa bater com --surface-base de semantic.css em cada tema.
const THEME_COLOR = {
  light: '#f5f5f4',
  dark: '#0f0f11',
};

export function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') return preference;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyMetaThemeColor(resolved) {
  try {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', THEME_COLOR[resolved]);
  } catch {}
}

async function applyNativeStatusBar(resolved) {
  if (!Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable('StatusBar')) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Style.Dark = conteudo claro sobre fundo escuro.
    await StatusBar.setStyle({ style: resolved === 'dark' ? Style.Dark : Style.Light });
    // setBackgroundColor e Android-only; no iOS a chamada e ignorada/rejeitada.
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: THEME_COLOR[resolved] });
    }
  } catch {}
}

export function applyTheme(resolved) {
  const isDark = resolved === 'dark';
  try {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = resolved;
  } catch {}
  applyMetaThemeColor(resolved);
  applyNativeStatusBar(resolved);
}

export { THEME_COLOR };
