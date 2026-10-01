const decode = (value) => String(value ?? '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeKey = (value) => decode(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

const positiveNumber = (value) => {
  const number = Number(String(value ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function parsePoleKmzDetails(description) {
  const html = String(description ?? '');
  const fields = {};
  for (const match of html.matchAll(/<div>\s*<div>\s*<b>([^<]+):<\/b>\s*<\/div>\s*([^<]*)<hr\s*\/?\s*>/gi)) {
    const key = normalizeKey(match[1]);
    const value = decode(match[2]);
    if (key && value && value.toLowerCase() !== 'nenhum' && value.toLowerCase() !== 'nenhuma') {
      fields[key] = value;
    }
  }

  const luminaires = [];
  for (const row of html.matchAll(/<tr\s+class=["'](?:pr|ir)["']>([\s\S]*?)<\/tr>/gi)) {
    const columns = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((match) => decode(match[1]));
    if (columns.length !== 5 || !columns[0]) continue;
    const [descriptionText, wattsText, quantityText, consumptionText, meteredText] = columns;
    const watts = positiveNumber(wattsText);
    const quantity = positiveNumber(quantityText);
    const type = descriptionText.replace(/\b\d+(?:[.,]\d+)?\s*W\b[\s\S]*$/i, '').trim();
    luminaires.push({
      description: descriptionText,
      type: type || null,
      power_w: watts,
      quantity,
      kwh_month: positiveNumber(consumptionText),
      metered: /^sim$/i.test(meteredText),
    });
  }

  const types = [...new Set(luminaires.map((item) => item.type).filter(Boolean))];
  const powers = [...new Set(luminaires.map((item) => item.power_w).filter(Boolean))];
  const lamp_type = types.length === 1 ? types[0] : null;
  const lamp_power_w = powers.length === 1 ? powers[0] : null;
  const lamp_count = luminaires.length && luminaires.every((item) => item.quantity != null)
    ? luminaires.reduce((sum, item) => sum + item.quantity, 0) : null;

  // Apenas campos operacionais. URLs de fotos do HTML podem conter credenciais expiradas.
  const metadata = {
    source_address: fields.endereco || null,
    source_code: fields.codigo || null,
    feeder: fields.alimentador || null,
    transformer_code: fields.cod_trafo || null,
    switch_code: fields.chave || null,
    company_number: fields.num_cia || null,
    point_type: fields.tipo_de_ponto || null,
    characteristic: fields.caracteristica || null,
    network_type: fields.tipo_de_rede || null,
    source_plate: fields.plaqueta || null,
    quality: fields.qualidade || null,
    observations: fields.obs || null,
    lamp_count,
    luminaires,
  };
  return { lamp_type, lamp_power_w, metadata };
}
