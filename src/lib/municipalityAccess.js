export const hasMunicipalityPanelAccess = (user) => Boolean(
  user
  && !user.is_admin
  && !user.is_master
  && (
    user.tipo_conta === 'prefeitura'
    || user.has_municipality_access === true
  )
);
