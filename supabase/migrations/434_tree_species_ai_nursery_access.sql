begin;

-- A geração de resumos acompanha a manutenção do catálogo pelos viveiros.
-- Preserva a cota atômica de 30 gerações por usuário/dia, compartilhada entre cidades.
create or replace function public.consume_tree_species_ai_quota(p_city_id bigint) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare used integer;
begin
  if auth.uid() is null or not coalesce(public.can_manage_tree_adoption(p_city_id), false) then
    raise exception 'Sem permissão para gerenciar as espécies desta cidade.' using errcode = '42501';
  end if;
  insert into public.tree_species_ai_usage as usage(user_id, usage_date, requests)
    values (auth.uid(), (now() at time zone 'America/Fortaleza')::date, 1)
    on conflict (user_id, usage_date) do update set requests = usage.requests + 1
      where usage.requests < 30
    returning requests into used;
  return used is not null;
end $$;
revoke all on function public.consume_tree_species_ai_quota(bigint) from public, anon, authenticated;
grant execute on function public.consume_tree_species_ai_quota(bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
