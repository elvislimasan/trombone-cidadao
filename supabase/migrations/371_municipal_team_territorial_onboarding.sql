begin;

-- A prefeitura pode liberar seus próprios funcionários sem alterar regras
-- globais de cargos nem concessões de outras cidades. Bloqueios individuais
-- definidos pela plataforma continuam prevalecendo.
alter table public.urban_planner_cities
  add column municipal_enabled boolean not null default false,
  add column municipal_canal_id uuid references public.orgao_canais(id) on delete cascade,
  add constraint urban_planner_municipal_channel check(not municipal_enabled or municipal_canal_id is not null);
alter table public.tree_manager_cities add column municipal_enabled boolean not null default false;
alter table public.prefeitura_convites
  add column asset_modules text[] not null default '{}',
  add constraint prefeitura_convites_asset_modules check(asset_modules <@ array['urban_planning','arborization']::text[]);

create function public.territorial_rule_allows(p_user uuid,p_module text,p_municipal boolean)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.profiles p where p.id=p_user and p.user_type='public_official')
    and coalesce(
      (select r.allowed from public.permission_rules r where r.scope='user' and r.user_id=p_user and r.module=p_module),
      p_municipal or coalesce((select r.allowed from public.permission_rules r where r.scope='role'
        and r.role_name=case when p_module='urban_planning' then 'urban_planner' else 'tree_manager' end
        and r.module=p_module),false),false)
$$;
revoke all on function public.territorial_rule_allows(uuid,text,boolean) from public,anon,authenticated;

create or replace function public.can_write(p_user uuid,p_module text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select case when p_user is null then false when public.is_master(p_user) then true
    when p_module='urban_planning' then exists(select 1 from public.urban_planner_cities a where a.user_id=p_user
      and (not a.municipal_enabled or public.tree_management_membership(a.user_id,a.city_id,a.municipal_canal_id))
      and public.territorial_rule_allows(p_user,p_module,a.municipal_enabled))
    when p_module='arborization' then exists(select 1 from public.tree_manager_cities a where a.user_id=p_user
      and public.tree_management_membership(a.user_id,a.city_id,a.canal_id)
      and public.territorial_rule_allows(p_user,p_module,a.municipal_enabled))
    else coalesce(
      (select r.allowed from public.permission_rules r where r.scope='user' and r.user_id=p_user and r.module=p_module),
      (select r.allowed from public.permission_rules r where r.scope='role' and r.module=p_module and r.role_name=(
        select case when coalesce(p.is_admin,false) then 'admin' when coalesce(p.is_ambassador,false) then 'ambassador' end
        from public.profiles p where p.id=p_user)),true) end
$$;

create or replace function public.pode_gerenciar_mapa_ruas(p_city_id bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_city_id is not null and (public.is_master(auth.uid()) or exists(
    select 1 from public.urban_planner_cities a where a.user_id=auth.uid() and a.city_id=p_city_id
      and (not a.municipal_enabled or public.tree_management_membership(a.user_id,a.city_id,a.municipal_canal_id))
      and public.territorial_rule_allows(a.user_id,'urban_planning',a.municipal_enabled)))
$$;
create or replace function public.pode_gerenciar_arborizacao(p_city_id bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_city_id is not null and (public.is_master(auth.uid()) or exists(
    select 1 from public.tree_manager_cities a where a.user_id=auth.uid() and a.city_id=p_city_id
      and public.tree_management_membership(a.user_id,a.city_id,a.canal_id)
      and public.territorial_rule_allows(a.user_id,'arborization',a.municipal_enabled)))
$$;

-- O cliente recebe apenas cidades onde existe acesso efetivo. Uma concessão
-- municipal em A nunca desbloqueia uma atribuição antiga bloqueada em B.
create or replace function public.territorial_workspace() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'street_city_ids',coalesce((select jsonb_agg(a.city_id) from public.urban_planner_cities a where a.user_id=auth.uid()
      and (not a.municipal_enabled or public.tree_management_membership(a.user_id,a.city_id,a.municipal_canal_id))
      and public.territorial_rule_allows(a.user_id,'urban_planning',a.municipal_enabled)),'[]'::jsonb),
    'tree_assignments',coalesce((select jsonb_agg(jsonb_build_object('city_id',a.city_id,'canal_id',a.canal_id,'secretaria',c.nome))
      from public.tree_manager_cities a join public.orgao_canais c on c.id=a.canal_id where a.user_id=auth.uid()
      and public.tree_management_membership(a.user_id,a.city_id,a.canal_id)
      and public.territorial_rule_allows(a.user_id,'arborization',a.municipal_enabled)),'[]'::jsonb),
    'municipalities',coalesce((select jsonb_agg(jsonb_build_object('city_id',p.city_id,'id',p.id,'nome',p.nome,'papel',m.papel))
      from public.prefeitura_membros m join public.prefeituras p on p.id=m.prefeitura_id
      where m.user_id=auth.uid() and m.ativo and p.status='ativa'),'[]'::jsonb))
$$;

-- Preserva a origem municipal quando o administrador da plataforma mantém
-- uma cidade já atribuída ao editar os demais dados do funcionário.
create or replace function public.set_urban_planner_cities(p_user_id uuid,p_city_ids bigint[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_type text;
begin
  if not (public.is_admin(auth.uid()) or public.is_master(auth.uid())) then
    raise exception 'Somente administradores podem atribuir responsabilidades.' using errcode='42501';
  end if;
  select user_type into v_type from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if coalesce(cardinality(p_city_ids),0)>0 and v_type is distinct from 'public_official' then
    raise exception 'A gestão exige o tipo Órgão Público.';
  end if;
  delete from public.urban_planner_cities where user_id=p_user_id and not(city_id=any(coalesce(p_city_ids,'{}'::bigint[])));
  insert into public.urban_planner_cities(user_id,city_id)
    select p_user_id,c from unnest(coalesce(p_city_ids,'{}'::bigint[])) c group by c on conflict do nothing;
end $$;

create function public.validate_municipal_asset_modules(p_modules text[]) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
begin
  if p_modules is null or array_position(p_modules,null) is not null
    or not(p_modules <@ array['urban_planning','arborization']::text[]) then
    raise exception 'Responsabilidades inválidas.' using errcode='22023';
  end if;
end $$;
revoke all on function public.validate_municipal_asset_modules(text[]) from public,anon,authenticated;

-- Função privada: somente os RPCs autorizados de convite/equipe a executam.
-- Somente os módulos selecionados são adicionados ao aceitar um convite.
create function public.grant_municipal_asset_modules(p_user uuid,p_city bigint,p_channel uuid,p_modules text[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.validate_municipal_asset_modules(p_modules);
  if cardinality(p_modules)>0 and not exists(select 1 from public.orgao_canais c
    join public.orgao_membros m on m.canal_id=c.id and m.user_id=p_user
    join public.prefeituras p on p.city_id=c.city_id and p.status='ativa'
    join public.prefeitura_membros pm on pm.prefeitura_id=p.id and pm.user_id=p_user and pm.ativo
    where c.id=p_channel and c.city_id=p_city and c.ativo and not c.canal_triagem) then
    raise exception 'O funcionário precisa de vínculo com a prefeitura e a secretaria.';
  end if;
  if 'urban_planning'=any(p_modules) then
    insert into public.urban_planner_cities(user_id,city_id,municipal_enabled,municipal_canal_id)
      values(p_user,p_city,true,p_channel) on conflict(user_id,city_id) do update
        set municipal_enabled=true,municipal_canal_id=excluded.municipal_canal_id;
  end if;
  if 'arborization'=any(p_modules) then
    insert into public.tree_manager_cities(user_id,city_id,canal_id,municipal_enabled)
      values(p_user,p_city,p_channel,true) on conflict(user_id,city_id) do update
        set municipal_enabled=true,canal_id=excluded.canal_id,granted_by=auth.uid();
  end if;
end $$;
revoke all on function public.grant_municipal_asset_modules(uuid,bigint,uuid,text[]) from public,anon,authenticated;

create function public.convidar_funcionario_municipal(p_prefeitura uuid,p_canal uuid,p_email text,p_papel text,p_modules text[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint; v_token uuid:=gen_random_uuid(); v_expires timestamptz:=now()+interval '7 days';
begin
  perform public.validate_municipal_asset_modules(p_modules);
  if p_papel is null or p_papel not in ('gestor','operador','eletricista','leitura') then raise exception 'Papel inválido.'; end if;
  if not exists(select 1 from public.orgao_canais c join public.prefeituras p on p.city_id=c.city_id
    where p.id=p_prefeitura and c.id=p_canal and p.status='ativa' and c.ativo and not c.canal_triagem
      and public.pode_administrar_prefeitura(auth.uid(),p.city_id)) then
    raise exception 'Selecione uma secretaria ativa da prefeitura que você administra.' using errcode='42501';
  end if;
  if btrim(coalesce(p_email,'')) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then raise exception 'Informe um e-mail válido'; end if;
  select city_id into v_city from public.prefeituras where id=p_prefeitura;
  update public.prefeitura_convites set status='revogado' where prefeitura_id=p_prefeitura and canal_id=p_canal
    and lower(email_convidado)=lower(btrim(p_email)) and status='pendente';
  insert into public.prefeitura_convites(prefeitura_id,canal_id,email_convidado,papel_prefeitura,papel_orgao,token,convidado_por,asset_modules,expires_at)
    values(p_prefeitura,p_canal,lower(btrim(p_email)),'colaborador',p_papel,v_token,auth.uid(),p_modules,v_expires);
  return jsonb_build_object('ok',true,'token',v_token,'expires_at',v_expires,'city_id',v_city);
end $$;
revoke all on function public.convidar_funcionario_municipal(uuid,uuid,text,text,text[]) from public,anon;
grant execute on function public.convidar_funcionario_municipal(uuid,uuid,text,text,text[]) to authenticated;

create or replace function public.aceitar_convite_prefeitura(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_convite public.prefeitura_convites%rowtype; v_city bigint;
  v_email text:=lower(coalesce(auth.jwt()->>'email','')); v_redirect text:='/prefeitura/visao-geral';
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para ativar o acesso'; end if;
  if public.is_admin(auth.uid()) or public.is_master(auth.uid()) then
    raise exception 'Administradores da plataforma não entram no painel operacional';
  end if;
  select * into v_convite from public.prefeitura_convites where token=p_token for update;
  if not found then raise exception 'Convite inválido ou expirado'; end if;
  if v_email<>lower(v_convite.email_convidado) then raise exception 'Este convite pertence a outro e-mail'; end if;
  -- Repetir um convite aceito não restaura permissões revogadas posteriormente.
  if v_convite.status='aceito' and v_convite.aceito_por=auth.uid() then
    return jsonb_build_object('ok',true,'prefeitura_id',v_convite.prefeitura_id);
  end if;
  if v_convite.status<>'pendente' or v_convite.expires_at<=now() then raise exception 'Convite inválido ou expirado'; end if;
  select city_id into v_city from public.prefeituras where id=v_convite.prefeitura_id and status='ativa';
  if v_city is null then raise exception 'Prefeitura indisponível'; end if;
  if v_convite.canal_id is not null and not exists(select 1 from public.orgao_canais c
    where c.id=v_convite.canal_id and c.city_id=v_city and c.ativo and not c.canal_triagem) then
    raise exception 'Secretaria indisponível nesta prefeitura';
  end if;
  -- Serializa alterações de equipe para a mesma pessoa, inclusive entre cidades.
  perform 1 from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'Perfil não encontrado'; end if;
  insert into public.prefeitura_membros(prefeitura_id,user_id,papel,ativo,convidado_por)
    values(v_convite.prefeitura_id,auth.uid(),v_convite.papel_prefeitura,true,v_convite.convidado_por)
    on conflict(prefeitura_id,user_id) do update set
      papel=case when prefeitura_membros.papel='administrador' then 'administrador' else excluded.papel end,
      ativo=true,updated_at=now();
  if v_convite.canal_id is not null then
    insert into public.orgao_membros(canal_id,user_id,papel,ativo,convidado_por)
      values(v_convite.canal_id,auth.uid(),v_convite.papel_orgao,true,v_convite.convidado_por)
      on conflict(canal_id,user_id) do update set papel=excluded.papel,ativo=true,updated_at=now();
  end if;
  update public.profiles set user_type='public_official',city_id=coalesce(city_id,v_city) where id=auth.uid();
  perform public.grant_municipal_asset_modules(auth.uid(),v_city,v_convite.canal_id,v_convite.asset_modules);
  if 'arborization'=any(v_convite.asset_modules) then
    update public.tree_manager_cities set granted_by=v_convite.convidado_por
      where user_id=auth.uid() and city_id=v_city;
  end if;
  update public.prefeitura_convites set status='aceito',aceito_por=auth.uid(),aceito_em=now() where id=v_convite.id;
  if cardinality(v_convite.asset_modules)>0 and not exists(select 1 from public.prefeitura_membros m
    where m.user_id=auth.uid() and m.papel='administrador' and m.ativo) then
    v_redirect='/prefeitura/gestao-territorial/' || case when 'urban_planning'=any(v_convite.asset_modules) then 'ruas' else 'arborizacao' end || '?cidade=' || v_city;
  end if;
  return jsonb_build_object('ok',true,'prefeitura_id',v_convite.prefeitura_id,'city_id',v_city,'redirect_to',v_redirect);
end $$;

create function public.listar_gestao_equipe_municipal(p_prefeitura uuid)
returns table(user_id uuid,asset_modules text[]) language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if not coalesce(public.pode_administrar_prefeitura(auth.uid(),v_city),false) then
    raise exception 'Somente o administrador desta prefeitura pode consultar os acessos.' using errcode='42501';
  end if;
  return query select m.user_id,array_remove(array[
    case when exists(select 1 from public.urban_planner_cities a where a.user_id=m.user_id and a.city_id=v_city) then 'urban_planning' end,
    case when exists(select 1 from public.tree_manager_cities a where a.user_id=m.user_id and a.city_id=v_city) then 'arborization' end
  ],null) from public.prefeitura_membros m where m.prefeitura_id=p_prefeitura;
end $$;
revoke all on function public.listar_gestao_equipe_municipal(uuid) from public,anon;
grant execute on function public.listar_gestao_equipe_municipal(uuid) to authenticated;

create function public.set_municipal_staff_access(p_member_id uuid,p_role text,p_active boolean,p_modules text[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid; v_city bigint; v_channel uuid;
begin
  perform public.validate_municipal_asset_modules(p_modules);
  if p_role is null or p_role not in ('gestor','operador','eletricista','leitura') or p_active is null then raise exception 'Acesso inválido.'; end if;
  select m.user_id,c.city_id,c.id into v_user,v_city,v_channel from public.orgao_membros m
    join public.orgao_canais c on c.id=m.canal_id where m.id=p_member_id and c.ativo and not c.canal_triagem;
  if not coalesce(public.pode_administrar_prefeitura(auth.uid(),v_city),false) then
    raise exception 'Somente o administrador desta prefeitura pode definir os acessos.' using errcode='42501';
  end if;
  perform 1 from public.profiles where id=v_user and not coalesce(is_admin,false) and not coalesce(is_master,false) for update;
  if not found then raise exception 'Funcionário não encontrado.'; end if;
  if not exists(select 1 from public.prefeitura_membros m join public.prefeituras p on p.id=m.prefeitura_id
    where m.user_id=v_user and m.ativo and p.city_id=v_city and p.status='ativa') then
    raise exception 'O funcionário precisa ter vínculo ativo com esta prefeitura.';
  end if;
  -- Papel, situação, tipo de perfil e responsabilidades são uma transação.
  update public.orgao_membros set papel=p_role,ativo=p_active,updated_at=now() where id=p_member_id;
  update public.profiles set user_type='public_official',city_id=coalesce(city_id,v_city) where id=v_user;
  delete from public.urban_planner_cities where user_id=v_user and city_id=v_city and not('urban_planning'=any(p_modules));
  delete from public.tree_manager_cities where user_id=v_user and city_id=v_city and not('arborization'=any(p_modules));
  -- Ao suspender, mantém as escolhas; a checagem de vínculo já bloqueia a escrita.
  perform public.grant_municipal_asset_modules(v_user,v_city,v_channel,p_modules);
end $$;
revoke all on function public.set_municipal_staff_access(uuid,text,boolean,text[]) from public,anon;
grant execute on function public.set_municipal_staff_access(uuid,text,boolean,text[]) to authenticated;

notify pgrst,'reload schema';
commit;
