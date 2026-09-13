// Only destinations that can reopen the report wizard are accepted.
export function reportReturnLocation(location = {}) {
  const pathname = ['/', '/feed', '/mapa'].includes(location.pathname)
    ? location.pathname : '/feed';
  const params = new URLSearchParams(location.search || '');
  params.set('criar_bronca', '1');
  return { pathname, search: `?${params.toString()}` };
}
