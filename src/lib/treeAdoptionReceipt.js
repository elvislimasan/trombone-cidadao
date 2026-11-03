export async function confirmAdoptionReceipt(client, request, userId) {
  if (!userId || request?.author_id !== userId || request.request_type !== 'muda' || request.status !== 'pronta_retirada') throw new Error('Este pedido não está disponível para confirmar recebimento.');
  const { data, error } = await client.rpc('confirm_tree_adoption_receipt', { p_id: request.id });
  if (error) throw new Error(['PGRST202', '42P01'].includes(error.code) ? 'A confirmação de recebimento está indisponível no momento. Tente novamente mais tarde.' : error.message || 'Não foi possível confirmar. Tente novamente.');
  const row = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (row?.id !== request.id || row.status !== 'concluida' || row.author_id !== userId || row.request_type !== 'muda' || !/^\d{4}-\d{2}-\d{2}$/.test(row.fulfilled_on || '')) throw new Error('Não foi possível confirmar o recebimento. Atualize a lista e confira o pedido.');
  return row;
}
