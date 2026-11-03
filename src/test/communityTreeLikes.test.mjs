import test from 'node:test';
import assert from 'node:assert/strict';
import { setCommunityTreeLike } from '../lib/communityTreeLikes.js';

test('curtir e desfazer enviam a intenção e usam o contador confirmado pelo banco', async () => {
  const calls = [];
  const client = { rpc: async (name, body) => { calls.push({ name, body }); return { data: { liked: body.p_liked, like_count: body.p_liked ? 42 : 41 } }; } };
  assert.deepEqual(await setCommunityTreeLike(client, 'tree', true), { liked: true, count: 42 });
  assert.deepEqual(await setCommunityTreeLike(client, 'tree', false), { liked: false, count: 41 });
  assert.deepEqual(calls, [true, false].map(liked => ({ name: 'set_community_tree_like', body: { p_tree: 'tree', p_liked: liked } })));
});

test('resposta inválida ou migração indisponível não produz curtida fictícia', async () => {
  for (const data of [null, {}, { liked: true, like_count: -1 }, { liked: 'true', like_count: 1 }, { liked: true, like_count: '1' }]) {
    await assert.rejects(setCommunityTreeLike({ rpc: async () => ({ data }) }, 'tree', true), /confirmar/);
  }
  await assert.rejects(setCommunityTreeLike({ rpc: async () => ({ error: { code: 'PGRST202' } }) }, 'tree', true), /indisponíveis/);
  await assert.rejects(setCommunityTreeLike({ rpc: async () => ({ error: { message: 'Árvore indisponível.' } }) }, 'tree', true), /Árvore indisponível/);
});

test('dados incompletos não fazem requisição', async () => {
  const client = { rpc() { assert.fail('Não deveria consultar o banco'); } };
  await assert.rejects(setCommunityTreeLike(client, null, true));
  await assert.rejects(setCommunityTreeLike(client, 'tree', null));
});
