// A completed patrol signal is a report even while awaiting moderation.
// Keep legacy reports with no origin; omit unconfirmed or empty signals.
export function profileReportsQuery(client, userId, columns = '*', options) {
  return client.from('reports').select(columns, options)
    .eq('author_id', userId)
    .or('origin.is.null,origin.neq.signal,signal_status.eq.done');
}
