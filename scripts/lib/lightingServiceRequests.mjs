import { createHash } from 'node:crypto';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
export function poleCode(value) {
  const code = clean(value).replace(/^\d+\s*[-–—]\s*/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ['', 'SN', 'SEMNUMERO', 'SEMIDENTIFICACAO'].includes(code) ? null : code;
}

export function distanceMeters(a, b) {
  const radians = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * radians / 2) ** 2
    + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians)
    * Math.sin((b.longitude - a.longitude) * radians / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

const validPosition = (p) => p.latitude !== null && p.longitude !== null
  && p.latitude !== '' && p.longitude !== ''
  && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
  && Math.abs(Number(p.latitude)) <= 90 && Math.abs(Number(p.longitude)) <= 180;

export function parseLightingRows(rawRows) {
  const seen = new Set();
  return rawRows.map(({ page, cells }) => {
    if (!Array.isArray(cells) || cells.length !== 20) throw new Error(`Linha inválida na página ${page}.`);
    const values = cells.map(clean);
    const row = Number(values[0]);
    const point = { latitude: Number(values[7]), longitude: Number(values[8]) };
    if (!Number.isSafeInteger(row) || row < 1 || seen.has(row) || !values[7] || !values[8] || !validPosition(point)) {
      throw new Error(`Número ou coordenadas inválidos na linha ${values[0]}.`);
    }
    seen.add(row);
    return { row, page, values, code: poleCode(values[6]), ...point };
  });
}

export function matchLightingRows(rows, poles, { cityId, radius = 20, minimumGap = 3 } = {}) {
  if (!Number.isSafeInteger(cityId) || cityId <= 0) throw new Error('Informe a cidade de destino.');
  const eligible = poles.filter((p) => Number(p.city_id) === cityId
    && p.validation_status === 'approved' && p.lighting_status !== 'removido' && validPosition(p));
  return rows.map((source) => {
    const byCode = source.code ? eligible.filter((p) => [poleCode(p.identifier), poleCode(p.plate)].includes(source.code)) : [];
    const candidates = (byCode.length ? byCode : eligible)
      .map((pole) => ({ pole, distance: distanceMeters(source, pole) }))
      .sort((a, b) => a.distance - b.distance || Number(a.pole.id) - Number(b.pole.id));
    const [first, second] = candidates;
    const method = byCode.length === 1 ? 'code' : byCode.length > 1 ? 'code_coordinates' : 'coordinates';
    const reason = !first ? 'no_candidates'
      : method !== 'code' && first.distance > radius ? 'outside_radius'
        : method !== 'code' && second && second.distance - first.distance < minimumGap ? 'ambiguous' : null;
    return {
      source, method, reason, pole: first?.pole || null, distance: first?.distance ?? null,
      warning: method === 'code' && first.distance > radius ? 'code_coordinate_conflict' : null,
      candidates: candidates.slice(0, 3).map(({ pole, distance }) => ({ id: pole.id, identifier: pole.identifier, distance })),
    };
  });
}

function stableUuid(value) {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function lightingEquipment(type, power, led = false) {
  const quantityAndPower = clean(power).match(/^(\d+)\s*x\s*\(?(\d+)\)?$/i);
  const typeQuantity = clean(type).match(/^(\d+)\s*x/i);
  const quantity = Number(quantityAndPower?.[1] || typeQuantity?.[1] || 1);
  const watts = quantityAndPower?.[2] || clean(power);
  const equipment = led
    ? (quantity === 1 ? 'luminária LED' : `${quantity} luminárias LED`)
    : (quantity === 1 ? 'lâmpada de vapor de sódio' : `${quantity} lâmpadas de vapor de sódio`);
  // A quantity in the type with a single power value is ambiguous in the PDF.
  // Preserve that value without interpreting it as total or per-unit wattage.
  return quantity > 1 && !quantityAndPower
    ? `${equipment} (potência indicada na planilha: ${watts} W)`
    : `${equipment} de ${watts} W${quantity > 1 ? ' cada' : ''}`;
}

export function lightingServiceDescription(sources, { coordinateWarning = false } = {}) {
  const services = new Map();
  for (const source of sources) {
    const c = source.values;
    if (!/vapor de s[oó]dio/i.test(c[9]) || !/LED/i.test(c[13])) {
      throw new Error(`Tipo de substituição não reconhecido no item ${source.row}.`);
    }
    const service = `Troca de ${lightingEquipment(c[9], c[10])} por ${lightingEquipment(c[13], c[14], true)}`;
    const items = services.get(service) || [];
    items.push(source.row);
    services.set(service, items);
  }
  const descriptions = [...services].map(([service, items]) => `${service}, conforme o projeto Ilumina PE (${items.length === 1 ? 'item' : 'itens'} ${items.join(', ')} da planilha).`);
  if (coordinateWarning) descriptions.push('Conferir a localização em campo: o barramento coincide, mas as coordenadas da planilha diferem do cadastro.');
  return descriptions.join('\n\n');
}

export function prepareLightingRequests(matches, { cityId, municipalityId, sourceId }) {
  if (!sourceId || !municipalityId) throw new Error('Informe a origem e a prefeitura.');
  const groups = new Map();
  const pending = matches.filter((m) => m.reason);
  for (const match of matches.filter((m) => !m.reason)) {
    const group = groups.get(match.pole.id) || [];
    group.push(match);
    groups.set(match.pole.id, group);
  }
  const requests = [];
  for (const group of groups.values()) {
    // Two separate source points must not silently become one physical pole.
    const collision = group.some((a) => group.some((b) => distanceMeters(a.source, b.source) > 10));
    let accepted = group;
    if (collision) {
      accepted = group.filter((m) => m.method === 'code');
      if (!accepted.length) {
        const ranked = [...group].sort((a, b) => a.distance - b.distance);
        const [closest, second] = ranked;
        // A collision does not invalidate a clearly closer source point. Keep
        // only that point when it has no conflicting code and is within 10 m.
        if (!closest.source.code && closest.distance <= 10
          && (!second || second.distance - closest.distance >= 3)) accepted = [closest];
      }
      const acceptedRows = new Set(accepted.map((m) => m.source.row));
      pending.push(...group.filter((m) => !acceptedRows.has(m.source.row))
        .map((m) => ({ ...m, reason: 'different_source_points_same_pole' })));
    }
    if (!accepted.length) continue;
    const pole = accepted[0].pole;
    const id = stableUuid(`${sourceId}:${cityId}:${municipalityId}:${pole.id}`);
    const description = lightingServiceDescription(accepted.map((m) => m.source), {
      coordinateWarning: accepted.some((m) => m.warning),
    });
    const source = accepted[0].source;
    requests.push({
      sourceRows: accepted.map((m) => m.source.row), methods: accepted.map((m) => m.method),
      warnings: accepted.filter((m) => m.warning).map((m) => ({ row: m.source.row, warning: m.warning, distance: m.distance })),
      payload: {
        id, protocol: `ILUMINA-${id}`, title: `Ilumina PE — adequação da iluminação — ${poleCode(pole.identifier) || poleCode(pole.plate) || pole.id}`,
        description, category_id: 'iluminacao', issue_type: 'other', pole_id: pole.id,
        pole_number: poleCode(pole.plate) || poleCode(pole.identifier) || String(pole.id),
        reported_post_identifier: poleCode(pole.identifier), reported_plate: poleCode(pole.plate),
        location: `POINT(${pole.longitude} ${pole.latitude})`, reported_pole_distance_m: 0,
        address: source.values[2], neighborhood: source.values[1], reference_point: `Projeto Ilumina PE; itens ${accepted.map((m) => m.source.row).join(', ')}`,
        city_id: cityId, created_by_municipality: municipalityId, is_public: false,
        is_anonymous: false, is_petition: false, status: 'pending', moderation_status: 'internal',
      },
    });
  }
  return { requests, pending };
}
