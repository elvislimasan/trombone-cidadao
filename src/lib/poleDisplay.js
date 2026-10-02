const withoutSequence = (value) => String(value ?? '').trim().replace(/^\d+\s*[-–—]\s*(?=\S)/, '');

export function poleDisplayCode(pole) {
  const identifier = String(pole?.identifier ?? '').trim();
  const plate = pole?.plate || pole?.raw_properties?.municipal?.source_plate || pole?.raw_properties?.kmz?.source_plate;
  const source = /^\d+\s*[-–—]\s*\S/.test(identifier) ? identifier : plate || identifier;
  return withoutSequence(source);
}

export function poleDisplayLabel(pole) {
  const code = poleDisplayCode(pole);
  return code ? `Poste - ${code}` : 'Poste';
}
