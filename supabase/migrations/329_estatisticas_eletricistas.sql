begin;

create or replace function public.ranking_eletricistas_iluminacao(p_prefeitura uuid)
returns table(user_id uuid, nome text, servicos bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if v_city is null or not public.pode_acessar_prefeitura(auth.uid(),v_city) then
    raise exception 'Sem acesso às estatísticas desta prefeitura'; end if;
  if not public.pode_administrar_prefeitura(auth.uid(),v_city) and not exists (
    select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
    join public.orgao_categorias oc on oc.canal_id=c.id and oc.category_id='iluminacao'
    where m.user_id=auth.uid() and m.ativo and m.papel in ('eletricista','gestor','operador')
      and c.city_id=v_city
  ) then raise exception 'Sem acesso às estatísticas de iluminação'; end if;
  return query
  select d.atribuido_a, coalesce(nullif(p.name,''),'Eletricista'),
    sum(greatest(cardinality(d.service_types),1))::bigint
  from public.demandas_municipais d left join public.profiles p on p.id=d.atribuido_a
  where d.prefeitura_id=p_prefeitura and d.category_id='iluminacao'
    and d.status='concluida' and d.atribuido_a is not null
  group by d.atribuido_a,p.name order by 3 desc, 2 limit 50;
end $$;
revoke all on function public.ranking_eletricistas_iluminacao(uuid) from public,anon;
grant execute on function public.ranking_eletricistas_iluminacao(uuid) to authenticated;

create or replace function public.ordens_estatisticas_iluminacao(p_prefeitura uuid)
returns table(id uuid, protocolo text, titulo text, issue_type text, service_type text, service_types text[],
  status text, created_at timestamptz, executada_em timestamptz, concluida_em timestamptz,
  bairro text, pole_id bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select prefeituras.city_id into v_city from public.prefeituras
  where prefeituras.id=p_prefeitura and prefeituras.status='ativa';
  if v_city is null or not public.pode_acessar_prefeitura(auth.uid(),v_city) then
    raise exception 'Sem acesso às estatísticas desta prefeitura'; end if;
  if not public.pode_administrar_prefeitura(auth.uid(),v_city) and not exists (
    select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
    join public.orgao_categorias oc on oc.canal_id=c.id and oc.category_id='iluminacao'
    where m.user_id=auth.uid() and m.ativo and m.papel in ('eletricista','gestor','operador')
      and c.city_id=v_city
  ) then raise exception 'Sem acesso às estatísticas de iluminação'; end if;
  return query select d.id,d.protocolo,d.titulo,d.issue_type,d.service_type,d.service_types,d.status,
    d.created_at,d.executada_em,d.concluida_em,d.bairro,d.pole_id
  from public.demandas_municipais d
  where d.prefeitura_id=p_prefeitura and d.category_id='iluminacao';
end $$;
revoke all on function public.ordens_estatisticas_iluminacao(uuid) from public,anon;
grant execute on function public.ordens_estatisticas_iluminacao(uuid) to authenticated;

create or replace function public.solicitacoes_estatisticas_iluminacao(p_prefeitura uuid)
returns table(id uuid, pole_id bigint, neighborhood text, created_at timestamptz, status text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where prefeituras.id=p_prefeitura and prefeituras.status='ativa';
  if v_city is null or not public.pode_acessar_prefeitura(auth.uid(),v_city) then
    raise exception 'Sem acesso às estatísticas desta prefeitura'; end if;
  if not public.pode_administrar_prefeitura(auth.uid(),v_city) and not exists (
    select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
    join public.orgao_categorias oc on oc.canal_id=c.id and oc.category_id='iluminacao'
    where m.user_id=auth.uid() and m.ativo and m.papel in ('eletricista','gestor','operador')
      and c.city_id=v_city
  ) then raise exception 'Sem acesso às estatísticas de iluminação'; end if;
  return query select r.id,r.pole_id,r.neighborhood,r.created_at,r.status
  from public.reports r where r.city_id=v_city and r.category_id='iluminacao'
    and r.moderation_status in ('approved','internal')
    and not coalesce(r.is_petition,false);
end $$;
revoke all on function public.solicitacoes_estatisticas_iluminacao(uuid) from public,anon;
grant execute on function public.solicitacoes_estatisticas_iluminacao(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
