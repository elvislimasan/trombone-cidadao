import test from 'node:test';
import assert from 'node:assert/strict';
import { communityComparison, generateCommunityTreeCard } from '../lib/communityTreeShare.js';
import { publishCommunityComment } from '../lib/communityTreeComments.js';

test('comparação respeita ordem temporal e não usa seleção removida ou repetida', () => {
  const photos = [{id:'a',date:'2026-01-01'}, {id:'b',date:'2026-02-01'}];
  assert.equal(communityComparison(photos).comparison, true);
  assert.equal(communityComparison([photos[0]]).comparison, false);
  assert.throws(() => communityComparison(photos, {beforeId:'a',afterId:'a'}), /diferentes/);
  assert.throws(() => communityComparison(photos, {beforeId:'b',afterId:'a'}), /mais recente/);
  assert.throws(() => communityComparison(photos, {afterId:'private'}), /não está mais pública/);
});

test('exportação verifica publicação no servidor antes de consultar ou carregar fotos', async () => {
  const client = { async rpc(name) { assert.equal(name, 'get_community_tree'); return {data:{status:'pending',public_profile:true}}; } };
  await assert.rejects(generateCommunityTreeCard(client, {id:'tree'}, []), /aprovado e público/);
});

test('exportação exclui fotos privadas e moderadas mesmo para o proprietário', async () => {
  let signed;
  const client = { async rpc(name) { return {data:name === 'get_community_tree' ? {status:'approved',public_profile:true} : [{id:'private',photo_path:'private',is_public:false},{id:'hidden',photo_path:'hidden',is_public:true,is_hidden:true}]}; }, storage:{from(){return {async createSignedUrls(paths){signed=paths;return {data:[]};}};}} };
  await assert.rejects(generateCommunityTreeCard(client, {id:'tree'}, []), /foto pública/);
  assert.equal(signed, undefined);
});

test('comentário mantém UUID de repetição e não envia autoria ou dados do perfil', async () => {
  let payload;
  const client = {async rpc(name,args){assert.equal(name,'add_community_tree_comment');payload=args;return {data:args.p_id};}};
  assert.equal(await publishCommunityComment(client,{id:'retry-id',treeId:'tree',body:'  Bela árvore!  ',author_id:'forged'}),'retry-id');
  assert.deepEqual(payload,{p_id:'retry-id',p_tree:'tree',p_body:'Bela árvore!'});
  assert.throws(()=>publishCommunityComment(client,{id:'x',treeId:'tree',body:' '}),/comentário/);
  assert.throws(()=>publishCommunityComment(client,{id:'x',treeId:'tree',body:'x'.repeat(1001)}),/1.000/);
});
