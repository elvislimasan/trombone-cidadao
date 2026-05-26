// Links centralizados das lojas de apps.
//
// Para ATIVAR o redirecionamento para a App Store (iOS), preencha o Apple ID
// numérico do app abaixo. Você encontra em:
//   App Store Connect → seu app → App Information → "Apple ID" (ex: 6471234567)
//
// Enquanto APP_STORE_APP_ID estiver vazio, o iOS continua sem redirect (estado "em breve").
export const APP_STORE_APP_ID = '6766293242'; // <-- ex: '6471234567'

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.trombonecidadao.app';

export const APP_STORE_URL = APP_STORE_APP_ID
  ? `https://apps.apple.com/app/id${APP_STORE_APP_ID}`
  : '';

export const isAppStoreConfigured = Boolean(APP_STORE_APP_ID);

// Detecta a plataforma a partir do user agent (uso na web).
export const detectPlatform = () => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  return { isAndroid, isIOS, isDesktop: !isAndroid && !isIOS };
};

// Retorna a URL de loja adequada ao dispositivo.
// iOS só usa a App Store se ela estiver configurada; caso contrário cai na Play Store.
export const getStoreUrl = ({ isIOS } = {}) =>
  isIOS && APP_STORE_URL ? APP_STORE_URL : PLAY_STORE_URL;
