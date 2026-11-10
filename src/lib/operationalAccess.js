import { hasMunicipalityPanelAccess } from './municipalityAccess';

export const PIPA_HOME = '/operacao-pipa/pipeiro';
export const isPipaDriver = user => user?.app_metadata?.pipa_driver === true;
export const isPipaDriverPath = pathname => pathname === PIPA_HOME || pathname.startsWith(PIPA_HOME + '/');
export const operationalLoginPath = pathname => isPipaDriverPath(pathname) ? '/operacao-pipa/login' : pathname.startsWith('/prefeitura/') ? '/prefeitura/login' : '/login';
export function operationalRedirect(user, pathname) {
  if (!user) return null;
  if (isPipaDriver(user)) {
    if (pathname === '/alterar-senha') return PIPA_HOME + '/senha';
    return isPipaDriverPath(pathname) || ['/termos-de-uso', '/recuperar-senha', '/operacao-pipa/recuperar-senha'].includes(pathname) ? null : PIPA_HOME;
  }
  if (isPipaDriverPath(pathname)) return hasMunicipalityPanelAccess(user) ? '/prefeitura/visao-geral' : '/feed';
  return null;
}
export function isolatedOperationalShell(user, pathname) {
  return isPipaDriverPath(pathname) || pathname.startsWith('/prefeitura/') || ['/operacao-pipa/login','/operacao-pipa/recuperar-senha'].includes(pathname)
    || (isPipaDriver(user) || hasMunicipalityPanelAccess(user)) && ['/alterar-senha','/termos-de-uso','/recuperar-senha'].includes(pathname);
}
