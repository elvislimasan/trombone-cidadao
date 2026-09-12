-- O @username e a identidade publica da conta. Antes havia dois estados
-- independentes (username preenchido + toggle de ativacao), o que fazia uma
-- conta aparecer com @usuario e, ao mesmo tempo, oferecer "Criar perfil".

update public.profiles
set public_profile_enabled = true
where username_normalized is not null
  and public_profile_enabled = false;

create or replace function public.profiles_sync_public_profile_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.public_profile_enabled := new.username is not null and trim(new.username) <> '';
  return new;
end;
$$;

drop trigger if exists zz_profiles_sync_public_profile on public.profiles;
create trigger zz_profiles_sync_public_profile
  before insert or update of username on public.profiles
  for each row execute function public.profiles_sync_public_profile_trigger();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_enables_public_profile_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_enables_public_profile_check
      check (username_normalized is null or public_profile_enabled = true);
  end if;
end $$;

comment on column public.profiles.public_profile_enabled is
  'Mantido por compatibilidade. Passa a ser true automaticamente quando a conta possui @username.';
