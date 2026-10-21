import { distanceMeters, matchLightingRows, poleCode } from './lightingServiceRequests.mjs';

const positionValid = (p) => p && p.latitude != null && p.longitude != null
  && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
  && Math.abs(Number(p.latitude)) <= 90 && Math.abs(Number(p.longitude)) <= 180;
const normalized = (value) => String(value ?? '').trim().toUpperCase();

export function validateLightingReview(review, rows, { cityId, sourceId }) {
  if (review.version !== 1 || review.cityId !== cityId || review.sourceId !== sourceId) {
    throw new Error('A revisão não corresponde à cidade e ao PDF desta importação.');
  }
  const seen = new Set();
  const expected = new Set(rows.map((r) => r.row));
  for (const group of review.assignments) {
    if (!positionValid(group.target) || !poleCode(group.target.identifier) || !group.sourceRows?.length) {
      throw new Error('Vínculo revisado sem identificador, coordenadas ou itens.');
    }
    for (const item of group.sourceRows) {
      if (!expected.has(item) || seen.has(item)) throw new Error(`Item de revisão inválido ou repetido: ${item}`);
      seen.add(item);
    }
  }
  for (const entry of [...review.excluded, ...review.pending]) {
    if (!expected.has(entry.item) || seen.has(entry.item)) throw new Error(`Item de revisão inválido ou repetido: ${entry.item}`);
    seen.add(entry.item);
  }
  if (seen.size !== expected.size) throw new Error('A revisão deve classificar todas as linhas do PDF.');
  for (const op of review.inventoryOperations || []) {
    if (!['created', 'updated', 'removed'].includes(op.action) || !positionValid(op.target)
      || !poleCode(op.target.identifier) || (op.action !== 'created' && !positionValid(op.before))) {
      throw new Error('Correção de inventário inválida.');
    }
  }
}

// Identifiers and coordinates travel between environments; database IDs do not.
// An exact full identifier disambiguates inventories with repeated utility codes.
export function findReviewedPole(poles, reference, { cityId, includeRemoved = false, tolerance = 20 } = {}) {
  const eligible = poles.filter((p) => Number(p.city_id) === cityId && p.validation_status === 'approved'
    && (includeRemoved || p.lighting_status !== 'removido') && positionValid(p));
  const byCode = eligible.filter((p) => poleCode(p.identifier) === poleCode(reference.identifier));
  const full = byCode.filter((p) => normalized(p.identifier) === normalized(reference.identifier));
  const candidates = (full.length ? full : byCode)
    .map((pole) => ({ pole, distance: distanceMeters(reference, pole) }))
    .sort((a, b) => a.distance - b.distance);
  if (!candidates.length) return null;
  const [first, second] = candidates;
  if (first.distance > tolerance) throw new Error(`Código ${reference.identifier} existe fora da localização revisada; conferir antes de importar.`);
  if (second && second.distance - first.distance < 3) throw new Error(`Código ${reference.identifier} ainda é ambíguo no inventário de destino.`);
  return first.pole;
}

const equivalent = (key, a, b) => key === 'latitude' || key === 'longitude'
  ? a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-9
  : (a ?? null) === (b ?? null);

export function planReviewedInventory(poles, review) {
  const projected = poles.map((p) => ({ ...p }));
  const changes = [];
  for (const [index, op] of (review.inventoryOperations || []).entries()) {
    const opts = { cityId: review.cityId, includeRemoved: true };
    let pole = findReviewedPole(projected, op.target, opts);
    if (op.action === 'created') {
      if (pole) {
        if (pole.lighting_status === 'removido') throw new Error(`O poste revisado ${op.target.identifier} foi removido; não será recriado.`);
        continue; // Preserve subsequent work, including LED installation.
      }
      if (projected.some((p) => Number(p.city_id) === review.cityId
        && poleCode(p.identifier) === poleCode(op.target.identifier))) {
        throw new Error(`O código ${op.target.identifier} já possui cadastro não elegível; conferir antes de criar outro poste.`);
      }
      const virtual = { ...op.target, id: -(index + 1), city_id: review.cityId, validation_status: 'approved' };
      projected.push(virtual);
      changes.push({ index, action: 'created', poleId: null, values: op.target, details: op.details || {} });
      continue;
    }
    pole ||= findReviewedPole(projected, op.before, opts);
    if (!pole) throw new Error(`Poste da correção não encontrado: ${op.before.identifier}`);
    if (op.action === 'updated' && pole.lighting_status === 'removido') {
      throw new Error(`O poste ${pole.identifier} foi removido após a revisão; conferir a correção.`);
    }
    const patch = op.action === 'removed' ? { lighting_status: 'removido' } : op.patch;
    const changed = Object.keys(patch).filter((key) => !equivalent(key, pole[key], patch[key]));
    if (!changed.length) continue;
    for (const key of changed) {
      if (!equivalent(key, pole[key], op.before[key])) {
        throw new Error(`O campo ${key} de ${pole.identifier} mudou desde a revisão; conferir antes de sobrescrever.`);
      }
    }
    const values = { ...pole, ...patch };
    const details = { ...pole.raw_properties?.kmz, ...pole.raw_properties?.municipal, source_plate: values.plate || null };
    changes.push({ index, action: op.action, poleId: pole.id, values, details });
    Object.assign(pole, patch);
  }
  return { poles: projected, changes };
}

export function reviewedInventoryRpc(change, cityId) {
  const p = change.values;
  return {
    p_city_id: cityId, p_action: change.action, p_pole_id: change.poleId,
    p_number: p.identifier, p_address: p.address || null,
    p_lat: p.latitude, p_lng: p.longitude, p_lamp_type: p.lamp_type || null,
    p_power_w: p.lamp_power_w ?? null, p_status: p.lighting_status || 'aceso',
    p_details: change.action === 'removed' ? null : change.details,
  };
}

export function matchReviewedLightingRows(rows, poles, review, options) {
  validateLightingReview(review, rows, options);
  const byRow = new Map(review.assignments.flatMap((a) => a.sourceRows.map((row) => [row, a])));
  const excluded = new Map(review.excluded.map((e) => [e.item, e]));
  const fallback = matchLightingRows(rows, poles, options);
  const matches = [];
  for (const match of fallback) {
    if (excluded.has(match.source.row)) continue;
    const assignment = byRow.get(match.source.row);
    if (!assignment) { matches.push({ ...match, reason: 'manual_review_required' }); continue; }
    const pole = findReviewedPole(poles, assignment.target, { cityId: options.cityId });
    if (!pole) { matches.push({ ...match, pole: null, reason: 'reviewed_pole_missing' }); continue; }
    const warning = assignment.warnings?.find((w) => w.row === match.source.row);
    matches.push({ ...match, pole, method: 'code', reason: null,
      distance: distanceMeters(match.source, pole), warning: warning?.warning || null,
      reviewBasis: assignment.basis || 'Vínculo conferido na revisão do projeto' });
  }
  return { matches, excluded: review.excluded.map((entry) => ({ ...entry, source: rows.find((r) => r.row === entry.item) })) };
}
