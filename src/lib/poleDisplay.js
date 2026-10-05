export function poleCode(value) {
  return String(value ?? '').trim().replace(/^(?:poste\s+)?\d+\s*[-–—]\s*(?=\S)/iu, '');
}

export function poleReferenceText(value) {
  return String(value ?? '')
    .replace(/\b(poste\s+)\d+\s*[-–—]\s*(\d[\p{L}\p{N}._-]*)\b/giu, (_, label, code) => label + code)
    .replace(/\b\d+\s*[-–—]\s*([A-Z]{1,4}\d[\p{L}\p{N}._-]*)\b/giu, (_, code) => code.toUpperCase());
}

export function poleDisplayCode(pole) {
  const identifier = String(pole?.identifier ?? '').trim();
  const plate = pole?.plate || pole?.raw_properties?.municipal?.source_plate || pole?.raw_properties?.kmz?.source_plate;
  return poleCode(identifier || plate);
}

export function poleDisplayLabel(pole) {
  const code = poleDisplayCode(pole);
  return code ? `Poste - ${code}` : 'Poste';
}
