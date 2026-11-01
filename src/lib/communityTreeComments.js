import { communityRpc } from './communityTrees';

export const COMMUNITY_COMMENT_PAGE_SIZE = 20;
export function loadCommunityComments(client, treeId, page = 0) {
  return communityRpc(client, 'list_community_tree_comments', { p_tree: treeId, p_limit: COMMUNITY_COMMENT_PAGE_SIZE, p_offset: page * COMMUNITY_COMMENT_PAGE_SIZE });
}
export function publishCommunityComment(client, { id, treeId, body }) {
  const text = String(body || '').trim();
  if (!text || text.length > 1000) throw new Error('Escreva um comentário de até 1.000 caracteres.');
  if (!id || !treeId) throw new Error('Atualize a página antes de comentar.');
  return communityRpc(client, 'add_community_tree_comment', { p_id: id, p_tree: treeId, p_body: text });
}
export function deleteCommunityComment(client, id) {
  return communityRpc(client, 'delete_community_tree_comment', { p_id: id });
}
