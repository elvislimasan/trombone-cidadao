const DEFAULT_LEGACY_STORAGE_KEY = 'supabase-trombone-auth';

export const supabaseProjectRef = (supabaseUrl) => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
};

const decodeJwtPayload = (token) => {
  if (typeof token !== 'string') return null;
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) return null;

  try {
    const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

export const sessionProjectRef = (accessToken) => {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return null;
  if (typeof payload.ref === 'string' && payload.ref) return payload.ref;

  try {
    return new URL(payload.iss).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
};

const sessionAccessToken = (value, depth = 0) => {
  if (!value || typeof value !== 'object' || depth > 3) return null;
  if (typeof value.access_token === 'string') return value.access_token;

  for (const key of ['session', 'currentSession', 'data']) {
    const token = sessionAccessToken(value[key], depth + 1);
    if (token) return token;
  }
  return null;
};

/**
 * Isola a sessao por projeto Supabase.
 *
 * O app usava uma chave fixa no localStorage. Ao alternar entre homologacao e
 * producao, o JWT de um projeto era enviado ao outro e o gateway respondia
 * "No suitable key or wrong key type". A migracao abaixo conserva uma sessao
 * antiga somente quando o emissor do token pertence ao projeto atual.
 */
export const prepareSupabaseAuthStorage = ({
  storage,
  supabaseUrl,
  legacyStorageKey = DEFAULT_LEGACY_STORAGE_KEY,
}) => {
  const projectRef = supabaseProjectRef(supabaseUrl);
  const storageKey = projectRef
    ? `${legacyStorageKey}-${projectRef}`
    : legacyStorageKey;

  if (!storage || !projectRef) return storageKey;

  try {
    const legacyValue = storage.getItem(legacyStorageKey);
    const currentValue = storage.getItem(storageKey);

    if (!currentValue && legacyValue) {
      let parsedSession = null;
      try {
        parsedSession = JSON.parse(legacyValue);
      } catch {
        // Uma sessao ilegivel tambem nao deve continuar sendo enviada.
      }

      const accessToken = sessionAccessToken(parsedSession);
      if (sessionProjectRef(accessToken) === projectRef) {
        storage.setItem(storageKey, legacyValue);
      }
    }

    // A chave compartilhada e seu estado PKCE deixam de ser usados depois da
    // migracao, inclusive quando continham uma sessao de outro projeto.
    storage.removeItem(legacyStorageKey);
    storage.removeItem(`${legacyStorageKey}-code-verifier`);
  } catch {
    // Alguns navegadores podem bloquear localStorage. O cliente do Supabase
    // continua funcional durante a sessao mesmo sem a migracao persistente.
  }

  return storageKey;
};

