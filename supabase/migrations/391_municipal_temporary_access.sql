begin;

-- A senha nunca é armazenada em texto. Este registro é alterado somente pelo
-- provisionamento, pelo cadastro inicial e pelo trigger do Supabase Auth.
create table public.municipal_account_setup (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  password_expires_at timestamptz not null default now() + interval '24 hours',
  password_changed_at timestamptz,
  profile_completed_at timestamptz,
  terms_accepted_at timestamptz
);
alter table public.municipal_account_setup enable row level security;
revoke all on public.municipal_account_setup from public, anon, authenticated;

create function public.validate_municipal_provisioning(
  p_kind text, p_city bigint default null, p_prefeitura uuid default null,
  p_channel uuid default null, p_roles text[] default '{}'
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  if p_kind='administrator' then
    if not coalesce(public.is_admin(auth.uid()) or public.is_master(auth.uid()),false) then
      raise exception 'Somente a administração da plataforma pode criar administradores.' using errcode='42501';
    end if;
    select id into v_city from public.cities where id=p_city;
    if v_city is null then raise exception 'Selecione uma cidade válida.'; end if;
  elsif p_kind='staff' then
    select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
    if not coalesce(public.pode_administrar_prefeitura(auth.uid(),v_city),false) then
      raise exception 'Somente o administrador da prefeitura pode criar funcionários.' using errcode='42501';
    end if;
    if not exists(select 1 from public.orgao_canais where id=p_channel and city_id=v_city and ativo and not canal_triagem) then
      raise exception 'Selecione uma secretaria ativa desta prefeitura.';
    end if;
    perform public.validate_staff_roles(p_roles,p_channel);
    if not exists(select 1 from public.orgao_categorias where canal_id=p_channel)
      and p_roles is distinct from array['inventario']::text[] then
      raise exception 'Secretarias sem categorias permitem somente inventário.';
    end if;
  else raise exception 'Tipo de acesso inválido.';
  end if;
  return v_city;
end $$;

create function public.provision_municipal_account(
  p_user uuid, p_kind text, p_city bigint default null, p_name text default null,
  p_prefeitura uuid default null, p_channel uuid default null, p_roles text[] default '{}'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint; v_prefeitura uuid; v_email text; v_expires timestamptz;
begin
  v_city=public.validate_municipal_provisioning(p_kind,p_city,p_prefeitura,p_channel,p_roles);
  -- A marca é escrita exclusivamente pela Edge Function com service_role.
  -- Nunca permite converter, redefinir senha ou assumir uma conta existente.
  select email into v_email from auth.users where id=p_user
    and raw_app_meta_data->>'municipal_created_by'=auth.uid()::text
    and raw_app_meta_data->>'municipal_provisioned'='true' for update;
  if not found or exists(select 1 from public.municipal_account_setup where user_id=p_user) then
    raise exception 'Conta indisponível para provisionamento.' using errcode='42501';
  end if;
  update public.profiles set user_type='public_official',city_id=v_city,
    state_id=(select state_id from public.cities where id=v_city),name='',phone=null where id=p_user;
  if not found then raise exception 'O perfil da nova conta não foi criado.'; end if;
  if p_kind='administrator' then
    if btrim(coalesce(p_name,''))='' then raise exception 'Informe o nome da prefeitura.'; end if;
    insert into public.prefeituras(city_id,nome,status,criado_por,aprovado_por,aprovado_em)
      values(v_city,btrim(p_name),'ativa',auth.uid(),auth.uid(),now())
      on conflict(city_id) do update set nome=excluded.nome,status='ativa',aprovado_por=auth.uid(),aprovado_em=now(),updated_at=now()
      returning id into v_prefeitura;
    perform public.garantir_triagem_prefeitura(v_city,auth.uid());
    insert into public.prefeitura_membros(prefeitura_id,user_id,papel,ativo,convidado_por)
      values(v_prefeitura,p_user,'administrador',true,auth.uid());
  else
    v_prefeitura=p_prefeitura;
    perform public.municipal_assign_existing_public_official(p_prefeitura,p_channel,p_user,p_roles);
  end if;
  insert into public.municipal_account_setup(user_id,created_by) values(p_user,auth.uid())
    returning password_expires_at into v_expires;
  update public.prefeitura_convites set status='revogado'
    where prefeitura_id=v_prefeitura and lower(email_convidado)=lower(v_email) and status='pendente';
  return jsonb_build_object('user_id',p_user,'prefeitura_id',v_prefeitura,'password_expires_at',v_expires);
end $$;

create function public.municipal_account_status() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('profile_required',s.profile_completed_at is null,
    'password_required',s.password_changed_at is null and now()>=s.password_expires_at,
    'password_expires_at',case when s.password_changed_at is null then s.password_expires_at end)
  from public.municipal_account_setup s where s.user_id=auth.uid()
$$;

create function public.complete_municipal_account(p_name text,p_phone text,p_terms boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.municipal_account_setup where user_id=auth.uid() and profile_completed_at is null) then
    raise exception 'Cadastro inicial indisponível.';
  end if;
  if length(btrim(coalesce(p_name,'')))<3 or length(p_name)>160 then raise exception 'Informe seu nome completo.'; end if;
  if length(regexp_replace(coalesce(p_phone,''),'\D','','g')) not between 10 and 13 then raise exception 'Informe um telefone válido com DDD.'; end if;
  if p_terms is distinct from true then raise exception 'Aceite os termos para continuar.'; end if;
  update public.profiles set name=btrim(p_name),phone=btrim(p_phone),terms_accepted_at=now() where id=auth.uid();
  update public.municipal_account_setup set profile_completed_at=now(),terms_accepted_at=now() where user_id=auth.uid();
end $$;

create function public.municipal_password_updated() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password and coalesce(new.encrypted_password,'')<>'' then
    update public.municipal_account_setup set password_changed_at=now() where user_id=new.id and password_changed_at is null;
  end if;
  return new;
end $$;
create trigger municipal_password_updated after update of encrypted_password on auth.users
for each row execute function public.municipal_password_updated();

-- Protege também chamadas diretas à API e RPCs security definer. O Auth é
-- separado do PostgREST: a sessão ainda pode trocar a senha após o prazo.
create function public.check_municipal_account() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_setup public.municipal_account_setup; v_path text=current_setting('request.path',true);
begin
  if auth.uid() is null then return; end if;
  select * into v_setup from public.municipal_account_setup where user_id=auth.uid();
  if not found then return; end if;
  if v_path in ('/rpc/municipal_account_status','/rpc/complete_municipal_account') then return; end if;
  if current_setting('request.method',true) in ('GET','HEAD')
    and v_path in ('/profiles','/prefeitura_membros','/cities','/states') then return; end if;
  if v_setup.password_changed_at is null and now()>=v_setup.password_expires_at then
    raise exception 'Altere sua senha temporária para continuar.' using errcode='42501';
  end if;
  if v_setup.profile_completed_at is null then
    raise exception 'Complete seu cadastro no primeiro acesso.' using errcode='42501';
  end if;
end $$;

revoke all on function public.validate_municipal_provisioning(text,bigint,uuid,uuid,text[]),
  public.provision_municipal_account(uuid,text,bigint,text,uuid,uuid,text[]),public.municipal_account_status(),
  public.complete_municipal_account(text,text,boolean),public.check_municipal_account(),public.municipal_password_updated() from public,anon;
grant execute on function public.validate_municipal_provisioning(text,bigint,uuid,uuid,text[]),
  public.provision_municipal_account(uuid,text,bigint,text,uuid,uuid,text[]),public.municipal_account_status(),
  public.complete_municipal_account(text,text,boolean),public.check_municipal_account() to authenticated;
-- O hook também é executado para visitantes, retornando imediatamente.
grant execute on function public.check_municipal_account() to anon,service_role;
alter role authenticator set pgrst.db_pre_request='public.check_municipal_account';
notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
