export function legacyGuideRoute({ pathname, search = '', hash = '' }) {
  const params = new URLSearchParams(search);
  let target = pathname.replace(/^\/(?:servicos|guiadacidade)(?=\/|$)/, '/guia-da-cidade');
  const category = params.get('categoria');
  if (/^\/guia-da-cidade\/?$/.test(target) && category) {
    target = `/guia-da-cidade/categoria/${encodeURIComponent(category)}`;
    params.delete('categoria');
  }
  const query = params.toString();
  return { pathname: target, search: query ? `?${query}` : '', hash };
}
