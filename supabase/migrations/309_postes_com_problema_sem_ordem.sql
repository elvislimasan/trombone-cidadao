-- Postes com problema que ainda não têm uma ordem de iluminação ativa.
create or replace function public.postes_iluminacao_sem_ordem(p_city_id bigint)
returns table (
  id bigint, identifier text, plate text, address text,
  latitude double precision, longitude double precision,
  total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.pode_acessar_prefeitura(auth.uid(), p_city_id) then
    raise exception 'Sem acesso à prefeitura';
  end if;

  return query
  with unassigned as (
    select p.id, p.identifier, p.plate, p.address, p.latitude, p.longitude
    from public.poles p
    where p.city_id = p_city_id
      and p.lighting_status not in ('manutencao', 'removido')
      and (p.is_broken or p.lighting_status = 'apagado')
      and not exists (
        select 1 from public.demandas_municipais d
        join public.prefeituras m on m.id = d.prefeitura_id
        where m.city_id = p_city_id and d.pole_id = p.id
          and d.category_id = 'iluminacao'
          and d.status in ('aberta', 'triagem', 'programada', 'em_andamento',
            'aguardando_informacao', 'aguardando_recurso', 'aguardando_confirmacao')
      )
  )
  select u.id, u.identifier, u.plate, u.address, u.latitude, u.longitude,
    count(*) over () as total
  from unassigned u
  order by u.id
  limit 50;
end $$;

revoke all on function public.postes_iluminacao_sem_ordem(bigint) from public, anon;
grant execute on function public.postes_iluminacao_sem_ordem(bigint) to authenticated;
notify pgrst, 'reload schema';
