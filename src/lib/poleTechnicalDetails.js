export const emptyPoleTechnicalDetails = {
  source_code: '', source_plate: '', lamp_count: '', feeder: '', transformer_code: '',
  point_type: '', network_type: '', switch_code: '', company_number: '',
  characteristic: '', quality: '', observations: '', source_address: '',
  luminaires: [],
};

export function poleTechnicalDetailsFromRecord(pole) {
  const details = {
    ...pole?.raw_properties?.kmz,
    ...pole?.raw_properties?.municipal,
  };
  return {
    source_code: details.source_code ?? '',
    source_plate: details.source_plate ?? pole?.plate ?? '',
    lamp_count: details.lamp_count ?? '',
    feeder: details.feeder ?? '',
    transformer_code: details.transformer_code ?? '',
    point_type: details.point_type ?? '',
    network_type: details.network_type ?? '',
    switch_code: details.switch_code ?? '',
    company_number: details.company_number ?? '',
    characteristic: details.characteristic ?? '',
    quality: details.quality ?? '',
    observations: details.observations ?? '',
    source_address: details.source_address ?? '',
    luminaires: details.luminaires?.length
      ? details.luminaires.map((item) => ({
        ...item, description: item.description ?? '', quantity: item.quantity ?? '',
      })) : [],
  };
}

export function poleTechnicalDetailsPayload(form) {
  const clean = (value) => String(value ?? '').trim();
  const details = Object.fromEntries([
    'source_code', 'source_plate', 'feeder', 'transformer_code', 'point_type',
    'network_type', 'switch_code', 'company_number', 'characteristic',
    'quality', 'observations', 'source_address',
  ].map((key) => [key, clean(form[key]) || null]));
  details.lamp_count = form.lamp_count === '' ? null : Number(form.lamp_count);
  details.luminaires = (form.luminaires || [])
    .filter((item) => clean(item.description) || item.quantity !== '')
    .map((item) => ({
      ...item,
      description: clean(item.description),
      quantity: item.quantity === '' ? null : Number(item.quantity),
    }));
  return details;
}

export function validatePoleTechnicalDetails(details) {
  if (details.lamp_count != null && (!Number.isInteger(details.lamp_count) || details.lamp_count < 1 || details.lamp_count > 100)) {
    return 'Informe de 1 a 100 pontos de luz.';
  }
  for (const item of details.luminaires) {
    if (!item.description || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
      return 'Preencha a descrição e a quantidade de cada luminária.';
    }
  }
  if (details.lamp_count != null && details.luminaires.length
    && details.lamp_count !== details.luminaires.reduce((sum, item) => sum + item.quantity, 0)) {
    return 'A soma das quantidades de luminárias deve corresponder aos pontos de luz.';
  }
  return null;
}
