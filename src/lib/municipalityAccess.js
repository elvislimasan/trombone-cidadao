export const hasMunicipalityPanelAccess = (user) => Boolean(
  user
  && !user.is_admin
  && !user.is_master
  && (
    user.tipo_conta === 'prefeitura'
    || user.has_municipality_access === true
  )
);

export const shouldRedirectMunicipalityUser = (user, pathname) => {
  if (!hasMunicipalityPanelAccess(user)) return false;

  // A equipe abre a bronca pública pelo painel para conferir o relato e as
  // respostas oficiais, inclusive em outra aba com a mesma sessão.
  const allowed = pathname.startsWith('/prefeitura/')
    || /^\/bronca\/[^/]+\/?$/.test(pathname)
    || pathname === '/alterar-senha'
    || pathname === '/termos-de-uso';

  return !allowed;
};
