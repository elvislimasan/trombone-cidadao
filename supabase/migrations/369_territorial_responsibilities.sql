begin;

alter table public.permission_rules drop constraint permission_rules_role_name_check;
alter table public.permission_rules add constraint permission_rules_role_name_check
  check(role_name in ('ambassador','admin','urban_planner','tree_manager'));
alter table public.permission_rules drop constraint permission_rules_module_check;
alter table public.permission_rules add constraint permission_rules_module_check
  check(module in ('works','rentals','pavement','urban_planning','arborization','services','moderation'));
insert into public.permission_rules(scope,role_name,module,allowed)
values('role','tree_manager','arborization',false);

create table public.tree_manager_cities (
  user_id uuid not null references public.profiles(id) on delete cascade,
  city_id bigint not null references public.cities(id) on delete cascade,
  canal_id uuid not null references public.orgao_canais(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key(user_id,city_id)
);
create index tree_manager_cities_channel_idx on public.tree_manager_cities(canal_id);
alter table public.tree_manager_cities enable row level security;
revoke all on public.tree_manager_cities from public,anon,authenticated;
grant select on public.tree_manager_cities to authenticated;
create policy tree_manager_cities_read on public.tree_manager_cities for select to authenticated
  using(user_id=auth.uid() or public.is_admin(auth.uid()) or public.is_master(auth.uid()));

-- Consulta institucional independente da RLS de equipe; não concede acesso
-- às demandas da secretaria. Uma associação revogada perde efeito de imediato.
create function public.tree_management_membership(p_user uuid,p_city bigint,p_channel uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.orgao_canais c
    join public.orgao_membros m on m.canal_id=c.id and m.user_id=p_user and m.ativo
    join public.prefeituras p on p.city_id=c.city_id and p.status='ativa'
    join public.prefeitura_membros pm on pm.prefeitura_id=p.id and pm.user_id=p_user and pm.ativo
    where c.id=p_channel and c.city_id=p_city and c.ativo and not c.canal_triagem)
$$;
revoke all on function public.tree_management_membership(uuid,bigint,uuid) from public,anon,authenticated;

create or replace function public.can_write(p_user uuid,p_module text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select case
    when p_user is null then false
    when public.is_master(p_user) then true
    when p_module in ('urban_planning','arborization') then
      exists(select 1 from public.profiles p where p.id=p_user and p.user_type='public_official')
      and case when p_module='urban_planning' then
        exists(select 1 from public.urban_planner_cities a where a.user_id=p_user)
      else exists(select 1 from public.tree_manager_cities a where a.user_id=p_user
        and public.tree_management_membership(a.user_id,a.city_id,a.canal_id)) end
      and coalesce(
        (select r.allowed from public.permission_rules r where r.scope='user' and r.user_id=p_user and r.module=p_module),
        (select r.allowed from public.permission_rules r where r.scope='role' and r.role_name=case when p_module='urban_planning' then 'urban_planner' else 'tree_manager' end and r.module=p_module),false)
    else coalesce(
      (select r.allowed from public.permission_rules r where r.scope='user' and r.user_id=p_user and r.module=p_module),
      (select r.allowed from public.permission_rules r where r.scope='role' and r.module=p_module and r.role_name=(
        select case when coalesce(p.is_admin,false) then 'admin' when coalesce(p.is_ambassador,false) then 'ambassador' end from public.profiles p where p.id=p_user)),true)
  end
$$;

create function public.pode_gerenciar_arborizacao(p_city_id bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_city_id is not null and (public.is_master(auth.uid()) or (
    public.can_write(auth.uid(),'arborization') and exists(select 1 from public.tree_manager_cities a
      where a.user_id=auth.uid() and a.city_id=p_city_id
      and public.tree_management_membership(a.user_id,a.city_id,a.canal_id))))
$$;
revoke all on function public.pode_gerenciar_arborizacao(bigint) from public;
grant execute on function public.pode_gerenciar_arborizacao(bigint) to anon,authenticated;

create function public.territorial_workspace() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'tree_assignments',coalesce((select jsonb_agg(jsonb_build_object('city_id',a.city_id,'canal_id',a.canal_id,'secretaria',c.nome))
      from public.tree_manager_cities a join public.orgao_canais c on c.id=a.canal_id
      where a.user_id=auth.uid() and public.tree_management_membership(a.user_id,a.city_id,a.canal_id)),'[]'::jsonb),
    'municipalities',coalesce((select jsonb_agg(jsonb_build_object('city_id',p.city_id,'id',p.id,'nome',p.nome,'papel',m.papel))
      from public.prefeitura_membros m join public.prefeituras p on p.id=m.prefeitura_id
      where m.user_id=auth.uid() and m.ativo and p.status='ativa'),'[]'::jsonb))
$$;
revoke all on function public.territorial_workspace() from public,anon;
grant execute on function public.territorial_workspace() to authenticated;

create function public.tree_management_channels(p_user_id uuid)
returns table(city_id bigint,canal_id uuid,nome text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not (public.is_admin(auth.uid()) or public.is_master(auth.uid())) then
    raise exception 'Somente administradores podem consultar os vínculos de gestão.' using errcode='42501';
  end if;
  return query select c.city_id,c.id,c.nome from public.orgao_canais c
    where public.tree_management_membership(p_user_id,c.city_id,c.id) order by c.nome,c.id;
end $$;
revoke all on function public.tree_management_channels(uuid) from public,anon;
grant execute on function public.tree_management_channels(uuid) to authenticated;

create function public.set_territorial_responsibilities(p_user_id uuid,p_street_city_ids bigint[],p_tree_assignments jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; target_type text;
begin
  if not (public.is_admin(auth.uid()) or public.is_master(auth.uid())) then
    raise exception 'Somente administradores podem atribuir responsabilidades.' using errcode='42501';
  end if;
  select user_type into target_type from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Usuário não encontrado.' using errcode='22023'; end if;
  if jsonb_typeof(p_tree_assignments) is distinct from 'array' then raise exception 'Lista de responsabilidades inválida.'; end if;
  if (select count(distinct j->>'city_id') from jsonb_array_elements(p_tree_assignments) j)<>jsonb_array_length(p_tree_assignments) then
    raise exception 'Informe uma única secretaria por cidade.';
  end if;
  if (jsonb_array_length(p_tree_assignments)>0 or coalesce(cardinality(p_street_city_ids),0)>0)
    and target_type is distinct from 'public_official' then raise exception 'A gestão exige o tipo Órgão Público.'; end if;
  for item in select value from jsonb_array_elements(p_tree_assignments) loop
    if not public.tree_management_membership(p_user_id,(item->>'city_id')::bigint,(item->>'canal_id')::uuid) then
      raise exception 'Selecione uma secretaria ativa da cidade, com vínculo ativo do funcionário e da prefeitura.';
    end if;
  end loop;
  -- Ambas as concessões são salvas ou desfeitas juntas.
  perform public.set_urban_planner_cities(p_user_id,p_street_city_ids);
  delete from public.tree_manager_cities a where a.user_id=p_user_id and not exists(
    select 1 from jsonb_array_elements(p_tree_assignments) j
      where (j->>'city_id')::bigint=a.city_id and (j->>'canal_id')::uuid=a.canal_id);
  insert into public.tree_manager_cities(user_id,city_id,canal_id)
    select p_user_id,(j->>'city_id')::bigint,(j->>'canal_id')::uuid from jsonb_array_elements(p_tree_assignments) j
    on conflict(user_id,city_id) do nothing;
end $$;
revoke all on function public.set_territorial_responsibilities(uuid,bigint[],jsonb) from public,anon;
grant execute on function public.set_territorial_responsibilities(uuid,bigint[],jsonb) to authenticated;

comment on table public.tree_manager_cities is 'Concessão de arborização por cidade e secretaria; não herda cargo de gestão de ruas.';
notify pgrst,'reload schema';
commit;
