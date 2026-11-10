import { hasMunicipalityPanelAccess } from './municipalityAccess';
import { resolvePostAuthFallback } from './homeEntry';

export const isProfileIncomplete = (user) => Boolean(user && (
  !user.name?.trim()
  || String(user.phone || '').replace(/\D/g, '').length < 10
  || !user.state_id
  || !user.city_id
  || !user.terms_accepted_at
));

export const shouldCompleteProfile = ({ user, loading, pathname }) => {
  if (loading || !isProfileIncomplete(user) || hasMunicipalityPanelAccess(user)) return false;

  // Cadastro e convites precisam terminar seu próprio fluxo de gravação.
  // Termos e recuperação/exclusão da conta continuam acessíveis.
  const allowed = [
    '/login', '/cadastro', '/seja-embaixador', '/completar-cadastro', '/termos-de-uso',
    '/recuperar-senha', '/alterar-senha', '/excluir-conta',
  ].includes(pathname) || /^\/prefeitura\/convite\/[^/]+(?:\/cadastro)?\/?$/.test(pathname);

  return !allowed;
};

export const profileCompletionDestination = (from) => {
  const pathname = from?.pathname;
  if (!pathname?.startsWith('/') || pathname.startsWith('//')
    || ['/login', '/cadastro', '/completar-cadastro'].includes(pathname)) {
    return resolvePostAuthFallback();
  }
  return { pathname, search: from.search || '', hash: from.hash || '' };
};
