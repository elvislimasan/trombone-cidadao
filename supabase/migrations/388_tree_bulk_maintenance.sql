begin;

-- Agendamento em lote, preservando o inventário e o histórico de serviços realizados.
create function public.schedule_city_tree_maintenance(
  p_city_id bigint,
  p_tree_ids uuid[],
  p_action text,
  p_due_at date default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_ids uuid[];
  v_count integer;
begin
  if auth.uid() is null or p_city_id is null or not public.pode_gerenciar_arborizacao(p_city_id) then
    raise exception 'Sem permissão para programar manejo nesta cidade.' using errcode='42501';
  end if;
  if coalesce(cardinality(p_tree_ids),0)=0 or array_position(p_tree_ids,null) is not null then
    raise exception 'Selecione pelo menos uma árvore válida.' using errcode='22023';
  end if;
  if p_action is null or p_action not in ('vistoria','poda','tratamento','remocao','plantio') then
    raise exception 'Selecione um manejo válido.' using errcode='22023';
  end if;
  if p_due_at is not null and (not isfinite(p_due_at) or p_due_at<date '0001-01-01' or p_due_at>date '9999-12-31') then
    raise exception 'Informe um prazo válido.' using errcode='22023';
  end if;
  select array_agg(distinct id order by id) into v_ids from unnest(p_tree_ids) as input(id);
  -- A ordem dos locks evita conflitos entre lotes concorrentes. Uma árvore
  -- excluída, removida ou de outra cidade invalida o lote inteiro antes de alterar dados.
  perform t.id from public.city_trees t
    where t.city_id=p_city_id and t.id=any(v_ids) and t.status<>'removida'
    order by t.id for update;
  get diagnostics v_count=row_count;
  if v_count<>cardinality(v_ids) then
    raise exception 'A seleção contém árvores indisponíveis. Atualize o mapa e selecione novamente.' using errcode='22023';
  end if;
  update public.city_trees t set maintenance_action=p_action,maintenance_due_at=p_due_at
    where t.city_id=p_city_id and t.id=any(v_ids) and t.status<>'removida';
  get diagnostics v_count=row_count;
  if v_count<>cardinality(v_ids) then
    raise exception 'Não foi possível atualizar todas as árvores. Nenhuma alteração foi mantida.' using errcode='42501';
  end if;
  -- O resultado compacto não sofre truncamento pela paginação do PostgREST.
  return jsonb_build_object('updated_count',v_count,'updated_at',now());
end;
$$;

revoke all on function public.schedule_city_tree_maintenance(bigint,uuid[],text,date) from public,anon;
grant execute on function public.schedule_city_tree_maintenance(bigint,uuid[],text,date) to authenticated;
notify pgrst,'reload schema';
commit;
