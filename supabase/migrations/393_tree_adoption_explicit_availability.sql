begin;

-- A existência da espécie no inventário não representa oferta de mudas.
-- O gatilho também protege RPCs/clientes anteriores, sem reescrever a 392.
create function public.check_tree_adoption_availability() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_species uuid; v_provider text;
begin
  if tg_op='INSERT' then
    v_species=new.species_id; v_provider=new.provider;
  elsif new.status='aprovada' and (
    old.status is distinct from new.status
    or old.approved_species_id is distinct from new.approved_species_id
    or old.confirmed_provider is distinct from new.confirmed_provider
  ) then
    v_species=new.approved_species_id; v_provider=new.confirmed_provider;
  else
    return new;
  end if;

  -- Mantém a disponibilidade estável até a transação do pedido terminar.
  perform 1 from public.tree_species_availability
    where species_id=v_species and provider=v_provider and status='disponivel'
    for share;
  if not found then
    raise exception 'A espécie não tem disponibilidade confirmada neste fornecedor. Atualize o catálogo e escolha uma opção disponível.' using errcode='23514';
  end if;
  return new;
end $$;

revoke all on function public.check_tree_adoption_availability() from public,anon,authenticated;
create trigger tree_adoption_availability_required
  before insert or update of status,approved_species_id,confirmed_provider on public.tree_adoption_requests
  for each row execute function public.check_tree_adoption_availability();

notify pgrst,'reload schema';
commit;
