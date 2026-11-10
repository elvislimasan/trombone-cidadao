export const IOS_UPDATE_DISMISS_KEY = 'ios-app-update-dismissed';
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const RETRY_INTERVAL = 5 * 60 * 1000;
const DISMISS_INTERVAL = 24 * 60 * 60 * 1000;

// App Store versions are numeric. Compare components, never decimal values
// or strings: 1.10 is newer than 1.9, and 1.2 equals 1.2.0.
export function compareAppVersions(left, right) {
  const parse = value => {
    if (typeof value !== 'string' || value.length > 64 || !/^\d+(?:\.\d+)*$/.test(value)) return null;
    const parts = value.split('.').map(Number);
    return parts.every(Number.isSafeInteger) ? parts : null;
  };
  const a = parse(left), b = parse(right);
  if (!a || !b) return null;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1;
  }
  return 0;
}

export function iosUpdateFromLookup(info, response, appId) {
  if (!info?.id || !Array.isArray(response?.results)) return null;
  const release = response.results.find(row => row && String(row.trackId) === String(appId) && row.bundleId === info.id);
  if (!release || compareAppVersions(release.version, info.version) !== 1) return null;
  return { version: release.version };
}

// Dependencies are provided by the native component. The controller also
// guards against resume events during a request and late results on unmount.
export function createIosUpdateChecker({ appId, getInfo, lookup, readDismissal, writeDismissal, onAvailable, now = Date.now }) {
  let disposed = false, pending = false, nextCheck = 0, dismissed = null;
  return {
    async check() {
      if (disposed || pending || now() < nextCheck || !appId) return;
      pending = true;
      try {
        const info = await getInfo();
        const data = await lookup(appId);
        const update = iosUpdateFromLookup(info, data, appId);
        nextCheck = now() + CHECK_INTERVAL;
        if (!update || disposed) return;
        if (!dismissed) {
          try { dismissed = await readDismissal(); } catch { /* Storage is optional. */ }
        }
        if (disposed) return;
        if (dismissed?.version === update.version && Number.isFinite(dismissed.at)
          && now() >= dismissed.at && now() - dismissed.at < DISMISS_INTERVAL) return;
        onAvailable(update);
      } catch {
        // Offline, malformed responses and unavailable store listings must
        // never block navigation. Retry on a later return to the app.
        nextCheck = now() + RETRY_INTERVAL;
      } finally { pending = false; }
    },
    async dismiss(version) {
      dismissed = { version, at: now() };
      try { await writeDismissal(dismissed); } catch { /* Keep the in-session choice. */ }
    },
    dispose() { disposed = true; },
  };
}
