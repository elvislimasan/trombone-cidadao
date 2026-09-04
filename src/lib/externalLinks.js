/**
 * Prepara links informados por gestores para uso em botões públicos.
 *
 * Aceita o formato mais natural de digitação (youtube.com/...) e acrescenta
 * HTTPS. Protocolos que poderiam executar código no navegador são recusados.
 */
export function normalizarLinkExterno(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return null;

  const candidato = /^[a-z][a-z\d+.-]*:/i.test(texto) ? texto : `https://${texto}`;

  try {
    const url = new URL(candidato);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function linkEhDoYoutube(valor) {
  const normalizado = normalizarLinkExterno(valor);
  if (!normalizado) return false;

  const host = new URL(normalizado).hostname.toLowerCase().replace(/^www\./, '');
  return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
}

export function textoDoBotaoExterno(texto, url) {
  const personalizado = String(texto || '').trim();
  if (personalizado) return personalizado;
  return linkEhDoYoutube(url) ? 'Abrir no YouTube' : 'Acessar mais informações';
}
