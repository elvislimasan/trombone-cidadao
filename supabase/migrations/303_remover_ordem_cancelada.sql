begin;

create or replace function public.remover_ordem_cancelada(p_prefeitura uuid, p_demanda uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint; v_status text;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if auth.uid() is null or v_city is null or not public.pode_administrar_prefeitura(auth.uid(),v_city) then
    raise exception 'Somente o administrador municipal pode remover ordens';
  end if;
  select status into v_status from public.demandas_municipais
  where id=p_demanda and prefeitura_id=p_prefeitura for update;
  if v_status is null then raise exception 'Ordem não encontrada'; end if;
  if v_status<>'cancelada' then raise exception 'Cancele a ordem antes de removê-la'; end if;
  delete from public.demandas_municipais where id=p_demanda and prefeitura_id=p_prefeitura;
end $$;
revoke all on function public.remover_ordem_cancelada(uuid,uuid) from public,anon;
grant execute on function public.remover_ordem_cancelada(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
