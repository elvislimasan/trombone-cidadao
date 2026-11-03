// Alguns provedores devolvem a UF também no nome (ex.: Floresta-PE).
// Só remove um sufixo delimitado que corresponda à UF já identificada.
export function normalizeGeocodeCityName(value, stateUf) {
  const city = String(value || '').trim();
  const uf = String(stateUf || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) return city || null;
  const suffix = new RegExp(`\\s*(?:[-–—/,]\\s*${uf}|\\(\\s*${uf}\\s*\\))$`, 'i');
  return city.replace(suffix, '').trim() || city || null;
}
