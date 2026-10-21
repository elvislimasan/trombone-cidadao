import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parseLightingRows, prepareLightingRequests } from '../../scripts/lib/lightingServiceRequests.mjs';
import { validateLightingReview, findReviewedPole, planReviewedInventory, matchReviewedLightingRows, reviewedInventoryRpc } from '../../scripts/lib/lightingServiceReview.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../scripts/data/ilumina-pe-floresta-2026.rows.json', import.meta.url), 'utf8'));
const review = JSON.parse(fs.readFileSync(new URL('../../scripts/data/ilumina-pe-floresta-2026.review.json', import.meta.url), 'utf8'));
const rows = parseLightingRows(raw);
const sourceId = createHash('sha256').update(JSON.stringify(raw)).digest('hex');
const options = { cityId: 64, sourceId };
const pole = (id, reference, overrides = {}) => ({ id, ...reference, city_id: 64, validation_status: 'approved', lighting_status: 'aceso', ...overrides });

test('revisão versionada classifica as 420 linhas, preserva correções e exclui pontos inexistentes', () => {
  validateLightingReview(review, rows, options);
  assert.equal(review.assignments.length, 395);
  assert.equal(review.assignments.flatMap((a) => a.sourceRows).length, 405);
  assert.equal(review.pending.length, 11);
  assert.deepEqual(review.excluded.map((e) => e.item), [77, 79, 151, 350]);
  assert.equal(review.assignments.find((a) => a.sourceRows.includes(85)).target.identifier, '13 - X076778');
  assert.equal(review.assignments.find((a) => a.sourceRows.includes(78)).target.identifier, 'ILUMINA-PE-078');
  assert.equal(review.assignments.find((a) => a.sourceRows.includes(92)).target.identifier, 'X059038');
  assert.equal(JSON.stringify(review).includes('poleId'), false);
  assert.throws(() => validateLightingReview(review, rows, { ...options, sourceId: 'outro-pdf' }), /não corresponde/);
  const duplicated = structuredClone(review); duplicated.excluded.push({ item: 85 });
  assert.throws(() => validateLightingReview(duplicated, rows, options), /repetido/);
});

test('referências não usam IDs do desenvolvimento nem atravessam cidades ou postes removidos', () => {
  const ref = review.assignments.find((a) => a.sourceRows.includes(85)).target;
  const records = [pole(1, ref, { city_id: 65 }), pole(2, ref, { lighting_status: 'removido' }), pole(900001, ref)];
  assert.equal(findReviewedPole(records, ref, { cityId: 64 }).id, 900001);
  assert.equal(findReviewedPole(records.slice(0, 2), ref, { cityId: 64 }), null);
  assert.throws(() => findReviewedPole([pole(3, ref), pole(4, ref)], ref, { cityId: 64 }), /ambíguo/);
  assert.throws(() => findReviewedPole([pole(3, { ...ref, longitude: ref.longitude + 0.01 })], ref, { cityId: 64 }), /fora da localização/);
});

test('inventário reproduz correções uma vez e preserva trabalhos posteriores', () => {
  const creation = review.inventoryOperations.find((o) => o.action === 'created');
  const single = { ...review, inventoryOperations: [creation] };
  const planned = planReviewedInventory([], single);
  assert.equal(planned.changes.length, 1);
  assert.equal(planned.changes[0].action, 'created');
  const rpc = reviewedInventoryRpc(planned.changes[0], 64);
  assert.equal(rpc.p_pole_id, null); assert.equal(rpc.p_city_id, 64);
  assert.equal(rpc.p_lamp_type, 'Vapor de sódio'); assert.equal(rpc.p_power_w, 70);
  const installed = pole(999, creation.target, { lamp_type: 'LED', lamp_power_w: 100 });
  assert.equal(planReviewedInventory([installed], single).changes.length, 0);
  assert.throws(() => planReviewedInventory([{ ...installed, lighting_status: 'removido' }], single), /não será recriado/);
  assert.throws(() => planReviewedInventory([{ ...installed, validation_status: 'pending' }], single), /cadastro não elegível/);
  const update = review.inventoryOperations.find((o) => o.action === 'updated' && o.target.identifier === 'X059038');
  const before = pole(50000, update.before, { lamp_type: 'LED', lamp_power_w: 100 });
  const result = planReviewedInventory([before], { ...review, inventoryOperations: [update] });
  assert.equal(result.poles[0].identifier, 'X059038');
  assert.equal(result.poles[0].lamp_type, 'LED');
  assert.equal(planReviewedInventory(result.poles, { ...review, inventoryOperations: [update] }).changes.length, 0);
  assert.throws(() => planReviewedInventory([{ ...before, plate: 'OUTRA-PLAQUETA' }], { ...review, inventoryOperations: [update] }), /mudou desde a revisão/);
});

test('simulação de produção recria o plano corrigido com IDs diferentes e mantém privadas as solicitações', () => {
  // Reconstruct only referenced inventory, with unrelated destination IDs.
  const destination = review.assignments.map((a, i) => pole(900000 + i, a.target));
  for (const op of review.inventoryOperations) {
    const i = destination.findIndex((p) => p.identifier === op.target.identifier && p.latitude === op.target.latitude && p.longitude === op.target.longitude);
    if (op.action === 'created') { if (i >= 0) destination.splice(i, 1); }
    else if (i >= 0) Object.assign(destination[i], op.before);
    else destination.push(pole(990000 + destination.length, op.before));
  }
  const projected = planReviewedInventory(destination, review);
  assert.equal(projected.changes.length, 19);
  assert.equal(planReviewedInventory(projected.poles, review).changes.length, 0);
  const { matches, excluded } = matchReviewedLightingRows(rows, projected.poles, review, options);
  const { requests, pending } = prepareLightingRequests(matches, { ...options, municipalityId: 'prefeitura-de-producao' });
  assert.equal(requests.length, 395);
  assert.equal(requests.reduce((n, r) => n + r.sourceRows.length, 0), 405);
  assert.equal(pending.length, 11);
  assert.equal(excluded.length, 4);
  for (const r of requests) {
    assert.equal(r.payload.is_public, false);
    assert.equal(r.payload.moderation_status, 'internal');
    assert.equal(r.payload.issue_type, 'other');
    assert.equal(r.payload.created_by_municipality, 'prefeitura-de-producao');
    assert.match(r.payload.description, /Troca de .*vapor de sódio/);
    assert.ok(r.payload.pole_id >= 900000 || r.payload.pole_id < 0);
  }
  assert.equal(requests.some((r) => r.sourceRows.includes(77)), false);
  assert.equal(pending.find((m) => m.source.row === 118).reason, 'manual_review_required');
});
