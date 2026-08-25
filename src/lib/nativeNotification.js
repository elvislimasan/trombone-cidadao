import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const MAX_NOTIFICATION_ID = 2147483647;
const DEDUPE_WINDOW_MS = 60000;

let lastNotificationId = Math.max(1, Math.floor(Date.now() % MAX_NOTIFICATION_ID));
let permissionRequest = null;
const recentNotifications = new Map();

const nextNotificationId = () => {
  lastNotificationId = (lastNotificationId % MAX_NOTIFICATION_ID) + 1;
  return lastNotificationId;
};

const canUseNativeNotifications = () => (
  Capacitor.isNativePlatform()
  && Capacitor.isPluginAvailable('LocalNotifications')
);

const hasNotificationPermission = async () => {
  const current = await LocalNotifications.checkPermissions();
  return current.display === 'granted';
};

export const requestNativeNotificationPermission = async () => {
  if (!canUseNativeNotifications()) return false;
  if (!permissionRequest) {
    permissionRequest = (async () => {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') return true;

      const requested = await LocalNotifications.requestPermissions();
      return requested.display === 'granted';
    })();
  }

  const currentRequest = permissionRequest;

  try {
    return await currentRequest;
  } catch (error) {
    console.error('[NativeNotification] Não foi possível solicitar permissão:', error);
    return false;
  } finally {
    if (permissionRequest === currentRequest) permissionRequest = null;
  }
};

/**
 * Agenda um aviso do sistema apenas no app nativo.
 *
 * Toasts e banners transitórios podem desaparecer enquanto o app está em
 * segundo plano. Esta função fica reservada aos resultados que a pessoa não
 * pode perder, como uploads, envios offline e arquivos finalizados.
 */
export const notifyNative = async ({
  title,
  body,
  extra,
  dedupeKey,
  delayMs = 0,
} = {}) => {
  if (!title || !body) return false;
  if (!canUseNativeNotifications()) return false;

  let reservedDedupeKey = null;
  let reservedAt = null;

  try {
    if (!(await hasNotificationPermission())) return false;

    const normalizedDedupeKey = dedupeKey == null ? null : String(dedupeKey);
    const now = Date.now();
    if (normalizedDedupeKey) {
      for (const [key, shownAt] of recentNotifications) {
        if (now - shownAt >= DEDUPE_WINDOW_MS) recentNotifications.delete(key);
      }

      const lastShownAt = recentNotifications.get(normalizedDedupeKey);
      if (lastShownAt && now - lastShownAt < DEDUPE_WINDOW_MS) return false;
      recentNotifications.set(normalizedDedupeKey, now);
      reservedDedupeKey = normalizedDedupeKey;
      reservedAt = now;
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: nextNotificationId(),
          title: String(title),
          body: String(body),
          ...(delayMs > 0
            ? { schedule: { at: new Date(Date.now() + delayMs) } }
            : {}),
          ...(extra ? { extra } : {}),
        },
      ],
    });

    return true;
  } catch (error) {
    if (reservedDedupeKey && recentNotifications.get(reservedDedupeKey) === reservedAt) {
      recentNotifications.delete(reservedDedupeKey);
    }
    console.error('[NativeNotification] Não foi possível agendar a notificação:', error);
    return false;
  }
};
