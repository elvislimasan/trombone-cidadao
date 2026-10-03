import { normalizeLampType, isStandardLampType } from '@/lib/lightingCatalog';
import { poleTechnicalDetailsFromRecord } from '@/lib/poleTechnicalDetails';

const numberedPoleCode = /\b\d+\s*[-–—]\s*(X[\p{L}\p{N}._-]+)\b/iu;

export function compactPoleReference(value) {
  return String(value ?? '').replace(new RegExp(numberedPoleCode.source, 'giu'), (_, code) => code.toUpperCase());
}

export function poleIdentifierFromTitle(title) {
  return String(title ?? '').match(numberedPoleCode)?.[1]?.toUpperCase() || '';
}

export function cleanPoleIdentifier(value) {
  const identifier = String(value ?? '').trim();
  const numbered = identifier.match(/^(?:poste\s+)?\d+\s*[-–—]\s*(X[\p{L}\p{N}._-]+)$/iu);
  return numbered ? numbered[1].toUpperCase() : /^X[\p{L}\p{N}._-]+$/iu.test(identifier) ? identifier.toUpperCase() : identifier;
}

export function electricianPoleForm(pole, orderTitle = '') {
  if (!pole) return null;
  const details = poleTechnicalDetailsFromRecord(pole);
  return {
    id: pole.id, identifier: cleanPoleIdentifier(pole.identifier) || poleIdentifierFromTitle(orderTitle),
    updated_at: pole.updated_at, lamp_type: normalizeLampType(pole.lamp_type),
    lamp_power_w: pole.lamp_power_w ?? '', lamp_count: details.lamp_count,
    source_plate: details.source_plate, point_type: details.point_type,
    network_type: details.network_type, feeder: details.feeder,
    transformer_code: details.transformer_code, switch_code: details.switch_code,
    company_number: details.company_number,
  };
}

export function fillElectricianPoleIdentifier(form, orderTitle = '') {
  if (!form) return null;
  return { ...form, identifier: cleanPoleIdentifier(form.identifier) || poleIdentifierFromTitle(orderTitle) };
}

export function electricianPolePayload(form) {
  if (!form?.id) throw new Error('Selecione o poste atendido antes de resolver o serviço.');
  const identifier = cleanPoleIdentifier(form.identifier);
  if (!identifier || identifier.length > 200) throw new Error('Informe um identificador do poste com até 200 caracteres.');
  if (!isStandardLampType(form.lamp_type)) throw new Error('Selecione o tipo de lâmpada instalado.');
  const power = form.lamp_power_w === '' ? null : Number(form.lamp_power_w);
  const count = form.lamp_count === '' ? null : Number(form.lamp_count);
  if (power != null && (!Number.isFinite(power) || power <= 0 || power > 999999.99)) throw new Error('Informe uma potência válida em watts.');
  if (count != null && (!Number.isInteger(count) || count < 1 || count > 100)) throw new Error('Informe de 1 a 100 pontos de luz.');
  return {
    identifier, lamp_type: normalizeLampType(form.lamp_type) || null, lamp_power_w: power, lamp_count: count,
    ...Object.fromEntries(['source_plate', 'point_type', 'network_type', 'feeder', 'transformer_code', 'switch_code', 'company_number']
      .map((key) => [key, String(form[key] ?? '').trim() || null])),
  };
}
