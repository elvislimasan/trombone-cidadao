import test from 'node:test';
import assert from 'node:assert/strict';
import { communityPhotoGallery, deleteCommunityRecord, updateCommunityCare, updateCommunityTree } from '../lib/communityTrees.js';

const tree = { id: 'tree-1', city_id: 64, name: 'Meu ipê', latitude: -8.6, longitude: -38.5, location_visibility: 'city', public_profile: true, cover_photo: 'owner/tree-1/cover.jpg', is_owner: true, updated_at: '2026-11-01T12:00:00.123456Z' };
const care = { id: 'care-1', tree_id: tree.id, action: 'watering', performed_on: '2026-01-01', notes: 'Rega feita.', is_public: false, photo_path: 'owner/tree-1/care.jpg', updated_at: tree.updated_at };

test('edição envia versão original e somente campos permitidos, preservando cidade e autoria', async () => {
  const calls = [];
  const client = { async rpc(name, args) { calls.push({ name, args }); return { data: tree.id }; } };
  await updateCommunityTree(client, { ...tree, city_id: 65, author_id: 'forged', status: 'approved', name: '  Novo nome  ' }, null, 'owner', tree);
  assert.equal(calls[0].name, 'update_community_tree');
  const payload = calls[0].args;
  assert.equal(payload.p_expected_updated_at, tree.updated_at);
  assert.equal(payload.p_tree.city_id, 64);
  assert.equal(payload.p_tree.name, 'Novo nome');
  for (const field of ['author_id', 'status', 'is_owner', 'updated_at']) assert.equal(Object.hasOwn(payload.p_tree, field), false);
});

test('edição bloqueia conta sem propriedade e cadastro sem versão antes de chamar o banco', async () => {
  const client = { rpc() { assert.fail('Não deve chamar o banco'); } };
  await assert.rejects(updateCommunityTree(client, tree, null, 'owner', { ...tree, is_owner: false }), /conta responsável/);
  await assert.rejects(updateCommunityTree(client, tree, null, 'owner', { ...tree, updated_at: null }), /Atualize/);
});

test('editar cuidado preserva foto e privacidade e ignora campos de moderação injetados', async () => {
  let args;
  const client = { async rpc(name, payload) { assert.equal(name, 'update_community_tree_care'); args = payload; return { data: care.id }; } };
  await updateCommunityCare(client, { ...care, notes: ' Revisado ', is_hidden: false, author_id: 'forged' }, null, 'owner', care);
  assert.equal(args.p_expected_updated_at, care.updated_at);
  assert.equal(args.p_care.photo_path, care.photo_path);
  assert.equal(args.p_care.notes, 'Revisado');
  assert.equal(args.p_care.is_public, false);
  assert.equal(Object.hasOwn(args.p_care, 'is_hidden'), false);
});

test('remover foto de um cuidado só limpa o arquivo depois de atualizar o registro', async () => {
  const events = [];
  const client = { async rpc(name, args) { events.push('updated'); assert.equal(args.p_care.photo_path, null); return { data: care.id }; }, storage: { from() { return { async remove(paths) { events.push(paths); return {}; } }; } } };
  await updateCommunityCare(client, care, null, 'owner', care, true);
  assert.deepEqual(events, ['updated', [care.photo_path]]);
});

test('exclusão usa versão e limpa somente arquivos da árvore e conta corretas', async () => {
  const calls = [];
  const client = { async rpc(name, args) { calls.push({ name, args }); return { data: ['owner/tree-1/cover.jpg', 'other/tree-1/private.jpg', 'owner/other-tree/photo.jpg', 'owner/tree-1/../other.jpg', 'owner/tree-1/cover.jpg'] }; }, storage: { from() { return { async remove(paths) { calls.push(paths); return {}; } }; } } };
  assert.deepEqual(await deleteCommunityRecord(client, { type: 'tree', record: tree, userId: 'owner' }), { cleanupPending: false });
  assert.equal(calls[0].name, 'delete_community_tree');
  assert.equal(calls[0].args.p_expected_updated_at, tree.updated_at);
  assert.deepEqual(calls[1], [tree.cover_photo]);
});

test('falha do banco não apaga fotos; falha da limpeza é informada após exclusão confirmada', async () => {
  const client = { async rpc() { return { error: { message: 'Sem acesso' } }; }, storage: { from() { assert.fail('Não deve limpar fotos'); } } };
  await assert.rejects(deleteCommunityRecord(client, { type: 'tree', record: tree, userId: 'owner' }), /Sem acesso/);
  const unavailableStorage = { async rpc() { return { data: [tree.cover_photo] }; }, storage: { from() { return { async remove() { return { error: { message: 'offline' } }; } }; } } };
  assert.deepEqual(await deleteCommunityRecord(unavailableStorage, { type: 'tree', record: tree, userId: 'owner' }), { cleanupPending: true });
});

test('galeria pública exclui cuidados privados e moderados; proprietário pode ver suas fotos privadas', () => {
  const rows = [{ id: 'private', action: 'growth', photo_url: 'PRIVATE', is_public: false }, { id: 'hidden', action: 'growth', photo_url: 'HIDDEN', is_public: true, is_hidden: true }, { id: 'public', action: 'growth', photo_url: 'PUBLIC', is_public: true }];
  assert.deepEqual(communityPhotoGallery({ ...tree, is_owner: false, photo_url: 'COVER' }, rows).map(row => row.url), ['COVER', 'PUBLIC']);
  assert.deepEqual(communityPhotoGallery({ ...tree, photo_url: 'COVER' }, rows).map(row => row.url), ['COVER', 'PRIVATE', 'PUBLIC']);
});
