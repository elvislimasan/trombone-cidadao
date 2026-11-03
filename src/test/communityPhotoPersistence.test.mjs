import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateCommunityPhotos, recordCommunityCare, submitCommunityTree } from '../lib/communityTrees.js';

const userId = '00000000-0000-4000-8000-000000000001';
const treeId = '10000000-0000-4000-8000-000000000001';
const care = { id: '20000000-0000-4000-8000-000000000001', tree_id: treeId, action: 'watering', performed_on: '2026-01-01', is_public: true, notes: 'Rega feita.' };

async function withPhotoEncoder(task) {
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image'), originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: class { naturalWidth = 400; naturalHeight = 300; async decode() {} } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement(name) { assert.equal(name, 'canvas'); return { getContext() { return { fillRect() {}, drawImage() {} }; }, toBlob(callback) { callback(new Blob(['jpeg'], { type: 'image/jpeg' })); } }; } } });
  try { return await task(new File(['photo'], 'arvore.jpg', { type: 'image/jpeg' })); }
  finally {
    if (originalImage === undefined) delete globalThis.Image; else Object.defineProperty(globalThis, 'Image', originalImage);
    if (originalDocument === undefined) delete globalThis.document; else Object.defineProperty(globalThis, 'document', originalDocument);
  }
}

function storageFixture({ missingCheck = false, loseFirstResponse = false } = {}) {
  const files = new Set(), removed = [], references = new Map(); let loseResponse = loseFirstResponse;
  const client = {
    async rpc(name, args) {
      if (name === 'can_cleanup_community_photo') return missingCheck ? { error: { code: 'PGRST202' } } : { data: ![...references.values()].includes(args.p_path) };
      if (name === 'record_community_tree_care' || name === 'submit_community_tree') {
        const payload = args.p_care || args.p_tree;
        if (!references.has(payload.id)) references.set(payload.id, payload.photo_path || payload.cover_photo);
        if (loseResponse) { loseResponse = false; return { error: { message: 'Resposta perdida' } }; }
        return { data: payload.id };
      }
      assert.fail(`RPC inesperado: ${name}`);
    },
    storage: { from() { return {
      async upload(path) { files.add(path); return {}; },
      // Simulates a broad permissive policy: deleting a linked path would succeed.
      async remove(paths) { for (const path of paths) { files.delete(path); removed.push(path); } return {}; },
    }; } },
  };
  return { client, files, removed, references };
}

test('foto de rega continua no armazenamento após salvar, mesmo se a exclusão for permissiva', async () => withPhotoEncoder(async file => {
  const state = storageFixture();
  assert.equal(await recordCommunityCare(state.client, care, file, userId), care.id);
  assert.equal(state.files.has(state.references.get(care.id)), true);
  assert.equal(state.files.size, 1); assert.deepEqual(state.removed, []);
}));

test('banco sem verificação de limpeza preserva a foto em vez de tentar removê-la', async () => withPhotoEncoder(async file => {
  const state = storageFixture({ missingCheck: true });
  await recordCommunityCare(state.client, { ...care, action: 'growth' }, file, userId);
  assert.equal(state.files.has(state.references.get(care.id)), true);
  assert.deepEqual(state.removed, []);
}));

test('resposta perdida e repetição preservam a foto confirmada e limpam só o upload duplicado', async () => withPhotoEncoder(async file => {
  const state = storageFixture({ loseFirstResponse: true });
  await assert.rejects(recordCommunityCare(state.client, care, file, userId), /Resposta perdida/);
  const original = state.references.get(care.id);
  assert.equal(state.files.has(original), true);
  assert.equal(await recordCommunityCare(state.client, care, file, userId), care.id);
  assert.equal(state.files.has(original), true); assert.equal(state.files.size, 1);
  assert.equal(state.removed.length, 1); assert.notEqual(state.removed[0], original);
}));

test('foto de capa também é preservada depois do cadastro', async () => withPhotoEncoder(async file => {
  const state = storageFixture();
  const tree = { id: treeId, city_id: 64, name: 'Meu ipê', latitude: -8.6, longitude: -38.5, location_visibility: 'city', public_profile: true };
  await submitCommunityTree(state.client, tree, file, userId);
  assert.equal(state.files.has(state.references.get(treeId)), true); assert.deepEqual(state.removed, []);
}));

test('foto vinculada que não recebe URL é identificada como indisponível, sem apagar os dados', async () => {
  const client = { storage: { from() { return { async createSignedUrls() { return { data: [{ path: 'missing', error: 'not found' }] }; } }; } } };
  const [entry] = await hydrateCommunityPhotos(client, [{ id: care.id, photo_path: 'missing', notes: 'Registro preservado' }]);
  assert.equal(entry.photo_url, null); assert.equal(entry.photo_unavailable, true);
  assert.equal(entry.photo_path, 'missing'); assert.equal(entry.notes, 'Registro preservado');
});
