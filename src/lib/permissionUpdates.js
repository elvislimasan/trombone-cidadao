export const PERMISSIONS_CHANGED_EVENT = 'tc-permissions-changed';
export const PERMISSIONS_STORAGE_KEY = 'tc-permissions-updated';

export function notifyPermissionsChanged(userId = null) {
  if (typeof window === 'undefined') return;
  const detail = { userId, revision: `${Date.now()}-${Math.random()}` };
  window.dispatchEvent(new CustomEvent(PERMISSIONS_CHANGED_EVENT, { detail }));
  try {
    // Avisa também o mapa que estiver aberto em outra aba da mesma origem.
    window.localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(detail));
  } catch { /* A atualização na aba atual funciona mesmo sem armazenamento. */ }
}
