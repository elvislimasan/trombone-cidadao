import { isTerritorialPublicDetail } from './territorialAccess.js';

export const hasMunicipalityPanelAccess = (user) => Boolean(
  user
  && !user.is_admin
  && !user.is_master
  && !user.app_metadata?.pipa_driver
  && (
    user.tipo_conta === 'prefeitura'
    || user.has_municipality_access === true
  )
);

export const resolveLoginDestination = (user, target, fallback = '/feed') => {
  if (user?.app_metadata?.pipa_driver) return target?.split('?')[0].match(/^\/operacao-pipa\/pipeiro(?:\/|$)/) ? target : '/operacao-pipa/pipeiro';
  if (target?.split('?')[0].match(/^\/operacao-pipa\/pipeiro(?:\/|$)/)) return hasMunicipalityPanelAccess(user) ? '/prefeitura/visao-geral' : fallback;
  if (target?.startsWith('/prefeitura/convite/') || target?.startsWith('/prefeitura/eletricista')) return target;
  // O layout resolve a área pelo workspace: inventário não passa pelo atendimento.
  return hasMunicipalityPanelAccess(user) ? '/prefeitura/visao-geral' : (target || fallback);
};

export const shouldRedirectMunicipalityUser = (user, pathname) => {
  if (!hasMunicipalityPanelAccess(user)) return false;

  // A equipe abre a bronca pública pelo painel para conferir o relato e as
  // respostas oficiais, inclusive em outra aba com a mesma sessão.
  const allowed = pathname.startsWith('/prefeitura/')
    || /^\/bronca\/[^/]+\/?$/.test(pathname)
    || isTerritorialPublicDetail(pathname)
    || ['/arborizacao/gerenciar', '/admin/arborizacao', '/pavimentacao/gerenciar', '/admin/pavimentacao'].includes(pathname)
    || pathname === '/alterar-senha'
    || pathname === '/termos-de-uso';

  return !allowed;
};
