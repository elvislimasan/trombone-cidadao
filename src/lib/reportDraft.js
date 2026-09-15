const STORAGE_KEY = 'tc_report_draft_v1';
const MEDIA_SESSION_KEY = 'tc_report_draft_session_id';
const DB_NAME = 'tc_drafts';
const DB_VERSION = 1;
const MEDIA_STORE = 'report_draft_media_v1';
const MEDIA_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const pick = (obj, keys) => {
  const out = {};
  for (const key of keys) {
    if (typeof obj?.[key] === 'undefined') continue;
    out[key] = obj[key];
  }
  return out;
};

const canUseIndexedDb = () => typeof indexedDB !== 'undefined';

const getSessionId = () => {
  try {
    const existing = sessionStorage.getItem(MEDIA_SESSION_KEY);
    if (existing) return existing;
    const next =
      (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
      `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(MEDIA_SESSION_KEY, next);
    return next;
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
};

const getMediaKey = () => `${STORAGE_KEY}:media:${getSessionId()}`;

const openDb = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txGet = async (key) => {
  const db = await openDb();
  try {
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_STORE);
    const req = store.get(key);
    const result = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      tx.commit?.();
    } catch {}
    return result || null;
  } finally {
    db.close();
  }
};

const txPut = async (value) => {
  const db = await openDb();
  try {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const req = store.put(value);
    await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } finally {
    db.close();
  }
};

const txDelete = async (key) => {
  const db = await openDb();
  try {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const req = store.delete(key);
    await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } finally {
    db.close();
  }
};

const cleanupOldMedia = async () => {
  const db = await openDb();
  const now = Date.now();
  try {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    await new Promise((resolve, reject) => {
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve();
          return;
        }
        const value = cursor.value;
        const key = String(value?.key || '');
        const savedAtMs = value?.savedAt ? Date.parse(value.savedAt) : NaN;
        const isOld = Number.isFinite(savedAtMs) ? now - savedAtMs > MEDIA_MAX_AGE_MS : true;
        if (key.startsWith(`${STORAGE_KEY}:media:`) && isOld) {
          try {
            cursor.delete();
          } catch {}
        }
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

export const loadReportDraft = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== 1) return null;
    if (!parsed.data || typeof parsed.data !== 'object') return null;
    if (canUseIndexedDb()) {
      Promise.resolve()
        .then(cleanupOldMedia)
        .catch(() => {});
    }
    return parsed;
  } catch {
    try {
      const rawLegacy = localStorage.getItem(STORAGE_KEY);
      if (!rawLegacy) return null;
      const parsedLegacy = JSON.parse(rawLegacy);
      if (!parsedLegacy || typeof parsedLegacy !== 'object') return null;
      if (parsedLegacy.version !== 1) return null;
      if (!parsedLegacy.data || typeof parsedLegacy.data !== 'object') return null;
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsedLegacy));
      } catch {}
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      if (canUseIndexedDb()) {
        Promise.resolve()
          .then(cleanupOldMedia)
          .catch(() => {});
      }
      return parsedLegacy;
    } catch {
      return null;
    }
  }
};

export const saveReportDraft = ({ formData, wizardStep }) => {
  const keys = [
    'title',
    'description',
    'category',
    'address',
    'location',
    'pole_number',
    'pole_id',
    'reported_post_identifier',
    'reported_plate',
    'reported_pole_distance_m',
    'issue_type',
    'is_from_water_utility',
    'is_anonymous',
  ];

  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    wizardStep: typeof wizardStep === 'number' ? wizardStep : 0,
    data: pick(formData || {}, keys),
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    if (canUseIndexedDb()) {
      Promise.resolve()
        .then(cleanupOldMedia)
        .catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
};

export const serializeDraftMedia = (item, kind) => {
  const file = item?.file;
  const name = String(item?.name || file?.name || (kind === 'video' ? 'video.mp4' : 'foto.jpg'));
  if (item?.nativePath) return { name, nativePath: item.nativePath, type: file?.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg') };
  if (!(file instanceof Blob)) return null;
  return { name, type: file.type, lastModified: file.lastModified || Date.now(), blob: file };
};

export const restoreDraftMedia = (item) => {
  if (item?.nativePath) return { name: item.name, nativePath: item.nativePath, type: item.type, isProcessing: false };
  if (!(item?.blob instanceof Blob)) return null;
  const file = new File([item.blob], item.name, { type: item.type, lastModified: item.lastModified });
  return { file, name: item.name, isProcessing: false };
};

export const saveReportDraftMedia = async ({ photos = [], videos = [] }) => {
  const photoPayload = photos.map(item => serializeDraftMedia(item, 'photo'));
  const videoPayload = videos.map(item => serializeDraftMedia(item, 'video'));
  // Do not navigate away if an attachment cannot be restored afterwards.
  if ([...photoPayload, ...videoPayload].some(item => !item)) return false;
  if (!canUseIndexedDb()) return photos.length + videos.length === 0;

  try {
    await cleanupOldMedia();
  } catch {}

  try {
    const key = getMediaKey();
    if (photoPayload.length + videoPayload.length === 0) {
      await txDelete(key);
      return true;
    }
    await txPut({
      key,
      savedAt: new Date().toISOString(),
      photos: photoPayload,
      videos: videoPayload,
    });
    return true;
  } catch {
    return false;
  }
};

export const loadReportDraftMedia = async () => {
  if (!canUseIndexedDb()) return null;
  try {
    await cleanupOldMedia();
  } catch {}
  try {
    const key = getMediaKey();
    const record = await txGet(key);
    return {
      photos: (record?.photos || []).map(restoreDraftMedia).filter(Boolean),
      videos: (record?.videos || []).map(restoreDraftMedia).filter(Boolean),
    };
  } catch {
    return null;
  }
};

export const clearReportDraftMedia = async () => {
  if (!canUseIndexedDb()) return false;
  try {
    await txDelete(getMediaKey());
    return true;
  } catch {
    return false;
  }
};

export const clearReportDraft = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    if (canUseIndexedDb()) {
      Promise.resolve()
        .then(clearReportDraftMedia)
        .catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
};
