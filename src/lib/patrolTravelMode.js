// Forma de deslocamento da patrulha.
//
// A escolha e explicita, em vez de inferida pela velocidade: uma leitura de GPS
// ruim faria o app trocar de modo no semaforo ou dentro de um tunel. O valor vai
// na URL para sobreviver a recarga e tambem fica no aparelho para os atalhos de
// missao que abrem uma categoria diretamente.

export const PATROL_TRAVEL_MODE_STORAGE_KEY = 'patrol_travel_mode';
export const PATROL_TRAVEL_MODE_PARAM = 'modo';

export const PATROL_TRAVEL_MODES = Object.freeze([
  Object.freeze({
    id: 'walking',
    label: 'A pé',
    shortLabel: 'Caminhada',
    description: 'Mais tempo para observar cada detalhe do caminho.',
    activeLabel: 'Patrulha a pé',
    announcement: 'Patrulha a pé iniciada',
  }),
  Object.freeze({
    id: 'driving',
    label: 'De carro',
    shortLabel: 'Carro',
    description: 'Alertas por voz para acompanhar o trajeto com segurança.',
    activeLabel: 'Patrulha de carro',
    announcement: 'Patrulha de carro iniciada',
  }),
]);

// Mantem o comportamento que existia antes do seletor: a patrulha nasceu para
// uso no carro. Links antigos, sem `?modo=`, continuam abrindo do mesmo jeito.
export const DEFAULT_PATROL_TRAVEL_MODE = 'driving';

const IDS = new Set(PATROL_TRAVEL_MODES.map((modo) => modo.id));
const ALIASES = Object.freeze({
  carro: 'driving',
  dirigindo: 'driving',
  caminhada: 'walking',
  caminhar: 'walking',
  'a-pe': 'walking',
});

export const isPatrolTravelMode = (value) => IDS.has(value);

export const parsePatrolTravelMode = (value) => {
  const normalizado = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const resolvido = ALIASES[normalizado] || normalizado;
  return IDS.has(resolvido) ? resolvido : null;
};

export const normalizePatrolTravelMode = (value) =>
  parsePatrolTravelMode(value) || DEFAULT_PATROL_TRAVEL_MODE;

export const getPatrolTravelMode = (value) => {
  const id = normalizePatrolTravelMode(value);
  return PATROL_TRAVEL_MODES.find((modo) => modo.id === id);
};

export const readStoredPatrolTravelMode = (storage) => {
  try {
    return normalizePatrolTravelMode(storage?.getItem?.(PATROL_TRAVEL_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_PATROL_TRAVEL_MODE;
  }
};

export const storePatrolTravelMode = (storage, value) => {
  const modo = normalizePatrolTravelMode(value);
  try { storage?.setItem?.(PATROL_TRAVEL_MODE_STORAGE_KEY, modo); } catch {}
  return modo;
};

/**
 * Resolve a URL primeiro. Sem parametro, usa a ultima escolha do aparelho.
 * Um parametro invalido nao e aceito silenciosamente como estado novo: cai no
 * padrao, mas nao sobrescreve a preferencia salva.
 */
export const resolvePatrolTravelMode = (search = '', storage) => {
  try {
    const params = new URLSearchParams(search);
    if (params.has(PATROL_TRAVEL_MODE_PARAM)) {
      return normalizePatrolTravelMode(params.get(PATROL_TRAVEL_MODE_PARAM));
    }
  } catch {}
  return readStoredPatrolTravelMode(storage);
};

// Diferente de `resolvePatrolTravelMode`, esta leitura e estrita: a rota que ja
// liga o GPS so pode abrir quando a tela de preparacao colocou uma escolha
// valida na URL. Ausente ou adulterado volta `null` e retorna ao pre-voo.
export const patrolTravelModeFromSearch = (search = '') => {
  try {
    const params = new URLSearchParams(search);
    return parsePatrolTravelMode(params.get(PATROL_TRAVEL_MODE_PARAM));
  } catch {
    return null;
  }
};

export const buildPatrolRunPath = (categoria, value) => {
  const modo = normalizePatrolTravelMode(value);
  const params = new URLSearchParams({ [PATROL_TRAVEL_MODE_PARAM]: modo });
  return `/patrulhar/${encodeURIComponent(categoria)}?${params.toString()}`;
};

export const buildPatrolPickPath = (categoria) => {
  if (!categoria) return '/patrulhar';
  const params = new URLSearchParams({ categoria: String(categoria) });
  return `/patrulhar?${params.toString()}`;
};
