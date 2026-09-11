/**
-- Módulo de domínio para validação, normalização e formatação de nomes de usuário
-- e perfis cívicos no Trombone Cidadão.
 */

export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'suporte',
  'support',
  'trombone',
  'trombonecidadao',
  'prefeitura',
  'vereador',
  'mandato',
  'oficial',
  'governo',
  'camara',
  'feed',
  'mapa',
  'bronca',
  'broncas',
  'obras',
  'obras-publicas',
  'estatisticas',
  'sobre',
  'contato',
  'noticias',
  'servicos',
  'perfil',
  'login',
  'cadastro',
  'entrar',
  'sair',
  'ajuda',
  'termos',
  'privacidade',
  'patrulha',
  'missoes',
  'agora',
  'radar',
  'pavimentacao',
  'abaixo-assinado',
  'peticoes',
  'favoritos',
  'settings',
  'api',
  'auth',
  'share',
  'u',
  'root',
  'moderador',
  'moderacao',
  'sistema',
  'ouvidoria',
  'denuncia',
  'relatorio',
]);

export const PROFILE_TYPE_INFO = {
  citizen: {
    label: 'Cidadão',
    description: 'Participação cívica comunitária',
    badgeClass: 'bg-surface-subtle text-content-secondary border-edge-subtle',
  },
  journalist: {
    label: 'Jornalista',
    description: 'Comunicação e cobertura local',
    badgeClass: 'bg-brand-subtleBg text-brand-subtleFg border-brand-subtleBorder',
  },
  mandate: {
    label: 'Mandato',
    description: 'Prestação de contas legislativa',
    badgeClass: 'bg-status-progressBg text-status-progressFg border-status-progressBorder',
  },
  official: {
    label: 'Órgão Público',
    description: 'Atendimento e serviços públicos',
    badgeClass: 'bg-status-resolvedBg text-status-resolvedFg border-status-resolvedBorder',
  },
  organization: {
    label: 'Organização',
    description: 'Coletivo ou associação comunitária',
    badgeClass: 'bg-surface-sunken text-content-primary border-edge-default',
  },
};

/**
 * Normaliza o username removendo espaços, '@' inicial e convertendo para minúsculas.
 */
export function normalizeUsername(value) {
  if (!value || typeof value !== 'string') return '';
  let clean = value.trim().toLowerCase();
  if (clean.startsWith('@')) {
    clean = clean.substring(1);
  }
  return clean;
}

/**
 * Verifica se um username é reservado pelo sistema.
 */
export function isReservedUsername(value) {
  const norm = normalizeUsername(value);
  return RESERVED_USERNAMES.has(norm);
}

/**
 * Valida a sintaxe e regras de um username.
 * Retorna { valid: boolean, error: string | null }
 */
export function validateUsername(value) {
  const norm = normalizeUsername(value);

  if (!norm) {
    return { valid: false, error: 'Informe um nome de usuário.' };
  }

  if (norm.length < 3) {
    return { valid: false, error: 'O nome de usuário deve ter no mínimo 3 caracteres.' };
  }

  if (norm.length > 30) {
    return { valid: false, error: 'O nome de usuário pode ter no máximo 30 caracteres.' };
  }

  if (norm.startsWith('.') || norm.endsWith('.')) {
    return { valid: false, error: 'O nome não pode começar nem terminar com ponto.' };
  }

  if (norm.includes('..')) {
    return { valid: false, error: 'Não é permitido usar dois pontos consecutivos.' };
  }

  if (!/^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$/.test(norm)) {
    return {
      valid: false,
      error: 'Use apenas letras minúsculas (sem acentos), números, ponto e sublinhado.',
    };
  }

  if (isReservedUsername(norm)) {
    return { valid: false, error: 'Este nome de usuário é reservado pelo sistema.' };
  }

  return { valid: true, error: null, normalized: norm };
}

/**
 * Retorna o caminho canônico interno do perfil público: /u/:username
 */
export function getPublicProfilePath(username) {
  const norm = normalizeUsername(username);
  return norm ? `/u/${norm}` : '/perfil';
}

/**
 * Retorna o texto formatado com arroba: @username
 */
export function formatUsername(username) {
  const norm = normalizeUsername(username);
  return norm ? `@${norm}` : '';
}

