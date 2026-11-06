const JOURNEYS = [
  { key: 'reports', table: 'reports', owner: 'author_id' },
  { key: 'following', table: 'favorite_reports', owner: 'user_id', columns: 'report:reports!inner(id)' },
  { key: 'trees', table: 'community_trees', owner: 'author_id', local: true },
  { key: 'requests', table: 'tree_adoption_requests', owner: 'author_id', local: true },
];

export async function fetchProfileJourneySummary(client, userId, cityId) {
  if (!userId) return {};
  const results = await Promise.allSettled(JOURNEYS.map(async journey => {
    let query = client.from(journey.table).select(journey.columns || 'id', { count: 'exact', head: true }).eq(journey.owner, userId);
    if (journey.local && cityId) query = query.eq('city_id', cityId);
    const { count, error } = await query;
    if (error) throw error;
    return typeof count === 'number' ? count : null;
  }));
  return Object.fromEntries(results.map((result, index) => [JOURNEYS[index].key, result.status === 'fulfilled' ? result.value : null]));
}
