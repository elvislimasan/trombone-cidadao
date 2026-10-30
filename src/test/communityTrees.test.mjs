import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommunityTree, validateCommunityCare, communityShareData, submitCommunityTree, recordCommunityCare, hydrateCommunityPhotos, communityApiError } from '../lib/communityTrees.js';
import { isTypePreferenceDisabled } from '../../supabase/functions/send-push-notification/gate.js';

const form = { id: 'tree-id', city_id: 64, name: '  Meu ipê  ', latitude: -8.6, longitude: -38.5, location_visibility: 'city', public_profile: true, cover_photo: 'own/tree/cover.jpg' };
const care = { id: 'care-id', tree_id: form.id, action: 'watering', performed_on: '2026-01-01', is_public: false, notes: ' Rega feita. ' };

test('cadastro aceita espécie desconhecida e valida localização, datas e privacidade', () => {
  assert.equal(validateCommunityTree(form, '2026-10-30'), '');
  for (const patch of [{ city_id: '' }, { name: 'ab' }, { latitude: null }, { latitude: NaN }, { longitude: 181 }, { address: 'a'.repeat(301) }, { planted_on: '2026-02-30' }, { planted_on: '2027-01-01' }, { location_visibility: 'everything' }, { public_profile: 'true' }]) assert.ok(validateCommunityTree({ ...form, ...patch }, '2026-10-30'), JSON.stringify(patch));
  assert.equal(validateCommunityTree({ ...form, planted_on: '2024-02-29' }, '2026-10-30'), '');
});

test('cuidados validam ação, data real até hoje e tamanho da observação', () => {
  assert.equal(validateCommunityCare(care, '2026-10-30'), '');
  for (const patch of [{ action: 'unknown' }, { performed_on: '' }, { performed_on: '2026-02-30' }, { performed_on: '2026-11-01' }, { notes: 'a'.repeat(1501) }]) assert.ok(validateCommunityCare({ ...care, ...patch }, '2026-10-30'));
});

test('compartilhamento exige aprovação e só usa fotos públicas não moderadas, sem dados pessoais', () => {
  const tree = { ...form, status: 'approved', city_name: 'Floresta', photo_url: 'cover', created_at: '2026-01-01T12:00:00Z', address: 'Endereço privado', author_id: 'private-id', public_care_count: 42 };
  const history = [{ is_public: false, photo_url: 'PRIVATE', performed_on: '2026-10-30' }, { is_public: true, is_hidden: true, photo_url: 'HIDDEN', performed_on: '2026-10-29' }, { is_public: true, photo_url: 'OLDER', performed_on: '2026-01-02' }, { is_public: true, photo_url: 'PUBLIC', performed_on: '2026-01-03' }];
  assert.equal(communityShareData({ ...tree, status: 'pending' }, history), null);
  assert.equal(communityShareData({ ...tree, public_profile: false }, history), null);
  const result = communityShareData(tree, history);
  assert.equal(result.after, 'PUBLIC'); assert.equal(result.count, 42);
  for (const key of ['latitude', 'longitude', 'address', 'author_id', 'notes']) assert.equal(Object.hasOwn(result, key), false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|HIDDEN|Endereço privado|private-id/);
});

test('envio preserva privacidade e ignora campos de aprovação ou autoria injetados', async () => {
  const calls = []; const client = { async rpc(name, args) { calls.push({ name, args }); return { data: form.id }; } };
  assert.equal(await submitCommunityTree(client, { ...form, author_id: 'forged', status: 'approved' }, null, 'owner'), form.id);
  const payload = calls[0].args.p_tree;
  assert.equal(payload.name, 'Meu ipê'); assert.equal(payload.species_id, null); assert.equal(payload.location_visibility, 'city');
  assert.equal(Object.hasOwn(payload, 'author_id'), false); assert.equal(Object.hasOwn(payload, 'status'), false);
  await recordCommunityCare(client, { ...care, is_hidden: false, author_id: 'forged' }, null, 'owner');
  const entry = calls[1].args.p_care; assert.equal(entry.is_public, false); assert.equal(entry.notes, 'Rega feita.'); assert.equal(Object.hasOwn(entry, 'is_hidden'), false);
});

test('resposta perdida no cadastro recupera confirmação sem duplicar e mantém erros recuperáveis', async () => {
  const client = { async rpc(name) { return name === 'submit_community_tree' ? { error: { message: 'Conexão perdida' } } : { data: { id: form.id, is_owner: true, status: 'pending' } }; } };
  assert.equal(await submitCommunityTree(client, form, null, 'owner'), form.id);
  await assert.rejects(submitCommunityTree({ async rpc() { return { error: { code: 'PGRST202' } }; } }, form, null, 'owner'), /atualização do banco/);
  await assert.rejects(submitCommunityTree(client, form, null, null), /Entre na sua conta/);
  assert.match(communityApiError({ code: '42P01' }), /preenchimento foi mantido/);
});

test('fotos usam URLs assinadas de curta duração e falha individual não expõe caminho como URL pública', async () => {
  const client = { storage: { from(bucket) { assert.equal(bucket, 'community-tree-photos'); return { async createSignedUrls(paths, seconds) { assert.equal(seconds, 300); assert.deepEqual(paths, ['cover', 'private']); return { data: [{ path: 'cover', signedUrl: 'signed' }, { path: 'private', error: 'denied' }] }; } }; } } };
  const rows = await hydrateCommunityPhotos(client, [{ cover_photo: 'cover' }, { photo_path: 'private' }, { cover_photo: 'cover' }]);
  assert.equal(rows[0].photo_url, 'signed'); assert.equal(rows[1].photo_url, null); assert.equal(rows[2].photo_url, 'signed');
});

test('push de revisão respeita preferência do cidadão e aceita contas sem a nova chave', () => {
  assert.equal(isTypePreferenceDisabled({}, 'community_tree_update'), false);
  assert.equal(isTypePreferenceDisabled({ community_tree_update: false }, 'community_tree_update'), true);
});
