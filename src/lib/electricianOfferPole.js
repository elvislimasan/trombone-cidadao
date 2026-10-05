import { poleCode } from '@/lib/poleDisplay';

// Relatos antigos guardam descricoes da plaqueta no lugar do identificador.
export function electricianOfferPoleCode(value) {
  const code = poleCode(value);
  const normalized = code.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
  return /^(?:poste\s+)?(?:(?:numero|numeracao|plaqueta)\s+(?:apagado|apagada|ilegivel|ausente)|sem\s+(?:numero|numeracao|plaqueta)|nao\s+informad[oa])$/.test(normalized) ? '' : code;
}

export async function loadElectricianOfferPole(client, offer, municipalityId) {
  if (!offer || !municipalityId) return null;
  const { data, error } = await client.rpc('poste_oferta_eletricista', {
    p_prefeitura: municipalityId, p_tipo: offer.tipo, p_id: offer.id,
  });
  if (error) throw error;
  if (!data) return null;
  const current = [data.identifier, data.plate].map(electricianOfferPoleCode).find(Boolean);
  const reported = [data.reported_post_identifier, data.reported_plate, data.pole_number]
    .map(electricianOfferPoleCode).find(Boolean);
  const code = current || reported;
  return code ? { code, nearby: Boolean(current && data.nearby) } : null;
}
