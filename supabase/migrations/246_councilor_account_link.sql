-- Vincula uma identidade legislativa a uma conta sem transformar o perfil
-- pessoal em perfil institucional. O admin confirma o vinculo; o titular
-- recebe permissao apenas para manter apresentacao e canais de contato.

alter table public.councilors
  add column if not exists claim_status text not null default 'unclaimed',
  add column if not exists linked_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null;

do $fn$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'councilors_claim_status_check'
      and conrelid = 'public.councilors'::regclass
  ) then
    alter table public.councilors
      add constraint councilors_claim_status_check
      check (claim_status in ('unclaimed', 'linked', 'verified', 'suspended'));
  end if;
end;
$fn$;

create index if not exists councilors_user_id_idx
  on public.councilors(user_id)
  where user_id is not null;

-- A policy antiga permite que embaixadores de pavimentacao mantenham os
-- dados do acervo. Este gatilho preserva essa autonomia, mas reserva ao admin
-- os campos que concedem propriedade e verificacao de identidade.
create or replace function public.protect_councilor_identity_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_is_admin boolean;
  v_identity_changed boolean;
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then return new; end if;

  v_identity_changed := case
    when tg_op = 'INSERT' then
      new.user_id is not null
      or new.claim_status <> 'unclaimed'
      or new.linked_at is not null
      or new.verified_at is not null
      or new.verified_by is not null
    else
      new.user_id is distinct from old.user_id
      or new.claim_status is distinct from old.claim_status
      or new.linked_at is distinct from old.linked_at
      or new.verified_at is distinct from old.verified_at
      or new.verified_by is distinct from old.verified_by
  end;

  if v_identity_changed then
    v_is_admin := coalesce((
      select p.is_admin or p.is_master
      from public.profiles p
      where p.id = auth.uid()
    ), false);
    if not v_is_admin then
      raise exception 'Vinculo e verificacao da pagina sao definidos pela moderacao';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists councilors_protect_identity_fields on public.councilors;
create trigger councilors_protect_identity_fields
before insert or update on public.councilors
for each row execute function public.protect_councilor_identity_fields();

create or replace function public.set_councilor_account_link(
  p_councilor_id uuid,
  p_user_id uuid default null,
  p_verified boolean default false
)
returns public.councilors
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_result public.councilors%rowtype;
  v_is_admin boolean;
begin
  v_is_admin := coalesce((
    select p.is_admin or p.is_master
    from public.profiles p
    where p.id = auth.uid()
  ), false);

  if not v_is_admin then
    raise exception 'Somente administradores podem vincular uma conta a um vereador';
  end if;
  if not exists (select 1 from public.councilors where id = p_councilor_id) then
    raise exception 'Vereador nao encontrado';
  end if;
  if p_user_id is not null and not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Conta nao encontrada';
  end if;

  update public.councilors
  set user_id = p_user_id,
      claim_status = case
        when p_user_id is null then 'unclaimed'
        when p_verified then 'verified'
        else 'linked'
      end,
      linked_at = case
        when p_user_id is null then null
        else coalesce(linked_at, now())
      end,
      verified_at = case when p_user_id is not null and p_verified then now() else null end,
      verified_by = case when p_user_id is not null and p_verified then auth.uid() else null end,
      updated_at = now()
  where id = p_councilor_id
  returning * into v_result;

  return v_result;
end;
$fn$;

create or replace function public.update_my_councilor_page(
  p_councilor_id uuid,
  p_photo_url text default null,
  p_biography text default null,
  p_phone text default null,
  p_email text default null,
  p_instagram_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null then raise exception 'Faca login para editar esta pagina'; end if;

  update public.councilors
  set photo_url = nullif(btrim(p_photo_url), ''),
      biography = nullif(btrim(p_biography), ''),
      phone = nullif(btrim(p_phone), ''),
      email = nullif(btrim(p_email), ''),
      instagram_url = nullif(btrim(p_instagram_url), ''),
      updated_at = now()
  where id = p_councilor_id
    and user_id = auth.uid()
    and claim_status in ('linked', 'verified');

  if not found then
    raise exception 'Esta conta nao pode editar a pagina legislativa';
  end if;
  return true;
end;
$fn$;

create or replace function public.get_councilor_account_identity(p_councilor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case
    when c.user_id is null then null
    else jsonb_build_object(
      'claim_status', c.claim_status,
      'profile', case
        when p.public_profile_enabled and p.username is not null then jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'username', p.username,
          'avatar_url', p.avatar_url
        )
        else null
      end
    )
  end
  from public.councilors c
  left join public.profiles p on p.id = c.user_id
  where c.id = p_councilor_id
    and c.claim_status in ('linked', 'verified');
$fn$;

-- Campos de identidade publica sao moderados. A conta continua livre para
-- ativar seu perfil de participacao e editar bio/username, mas nao consegue
-- conceder a si mesma um tipo institucional ou selo de verificacao.
create or replace function public.protect_profile_identity_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_is_admin boolean;
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then return new; end if;

  if new.public_profile_type is distinct from old.public_profile_type
     or new.verification_status is distinct from old.verification_status
     or new.verified_at is distinct from old.verified_at then
    v_is_admin := coalesce((
      select p.is_admin or p.is_master
      from public.profiles p
      where p.id = auth.uid()
    ), false);
    if not v_is_admin then
      raise exception 'Tipo e verificacao de perfil sao definidos pela moderacao';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists profiles_protect_identity_fields on public.profiles;
create trigger profiles_protect_identity_fields
before update on public.profiles
for each row execute function public.protect_profile_identity_fields();

revoke all on function public.set_councilor_account_link(uuid, uuid, boolean) from public;
grant execute on function public.set_councilor_account_link(uuid, uuid, boolean) to authenticated;
revoke all on function public.update_my_councilor_page(uuid, text, text, text, text, text) from public;
grant execute on function public.update_my_councilor_page(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.get_councilor_account_identity(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
