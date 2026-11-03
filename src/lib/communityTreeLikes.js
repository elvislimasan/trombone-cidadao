export async function setCommunityTreeLike(client, treeId, liked) {
  if (!treeId || typeof liked !== 'boolean') throw new Error('Atualize a página antes de curtir.');
  const { data, error } = await client.rpc('set_community_tree_like', { p_tree: treeId, p_liked: liked });
  if (error) throw new Error(['PGRST202', 'PGRST205', '42P01'].includes(error.code) ? 'As curtidas estão indisponíveis no momento. Tente novamente mais tarde.' : error.message || 'Não foi possível registrar sua curtida. Tente novamente.');
  if (typeof data?.liked !== 'boolean' || !Number.isSafeInteger(data?.like_count) || data.like_count < 0) throw new Error('Não foi possível confirmar sua curtida. Atualize a página.');
  return { liked: data.liked, count: data.like_count };
}
