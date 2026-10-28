export const BRAZIL_STATE_NAMES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
export function normalizeStateUf(value) {
  const code = String(value || '').trim().toUpperCase().replace(/^BR-/, '');
  return BRAZIL_STATE_NAMES[code] ? code : Object.keys(BRAZIL_STATE_NAMES).find(key => normalize(BRAZIL_STATE_NAMES[key]) === normalize(value)) || '';
}
// O catálogo público usa `state`; o workspace municipal também retorna `states`.
export const cityStateUf = city => normalizeStateUf(city?.state?.uf || city?.states?.uf || city?.state_uf || city?.uf || city?.state?.name || city?.states?.name);
