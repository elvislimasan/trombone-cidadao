-- 164_permission_rules.sql
-- Painel de permissões: master revoga escrita por cargo ou por usuário.
-- Modelo de bloqueio sobre padrão liberado — com a tabela vazia, ninguém é
-- afetado. Resolução: master → regra de usuário → regra de cargo → liberado.

create table if not exists public.permission_rules (
  id          bigint generated always as identity primary key,
  scope       text not null check (scope in ('role','user')),
  role_name   text check (role_name in ('ambassador','admin')),
  -- FK em profiles (não auth.users): o painel opera sobre perfis, e no dev há
  -- perfis sem auth.users correspondente (auth não é copiado no sync de prod).
  user_id     uuid references public.profiles(id) on delete cascade,
  module      text not null check (module in
                ('works','rentals','pavement','services','moderation')),
  allowed     boolean not null,
  created_at  timestamptz not null default now(),
  constraint permission_rules_scope_fields check (
    (scope = 'role' and role_name is not null and user_id is null) or
    (scope = 'user' and user_id  is not null and role_name is null)
  )
);

create unique index if not exists uq_permission_rules_role
  on public.permission_rules (role_name, module) where scope = 'role';
create unique index if not exists uq_permission_rules_user
  on public.permission_rules (user_id, module) where scope = 'user';

alter table public.permission_rules enable row level security;

-- Leitura liberada para autenticados: o frontend precisa saber as próprias
-- permissões para esconder botões e proteger rotas.
drop policy if exists permission_rules_select on public.permission_rules;
create policy permission_rules_select on public.permission_rules
  for select to authenticated using (true);

-- Só master administra as regras.
drop policy if exists permission_rules_write on public.permission_rules;
create policy permission_rules_write on public.permission_rules
  for all to authenticated
  using (public.is_master(auth.uid()))
  with check (public.is_master(auth.uid()));

-- Resolve a permissão de escrita de um usuário num módulo.
-- Quando o usuário acumula admin e embaixador, vale a regra do cargo MAIS
-- FORTE (admin > ambassador): bloquear "embaixador" atinge só quem é apenas
-- embaixador. Para tirar de um admin, bloqueia-se o cargo admin ou o usuário.
create or replace function public.can_write(p_user uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user is null then false
    -- Master nunca é bloqueado.
    when public.is_master(p_user) then true
    else coalesce(
      -- 1) Regra específica do usuário vence qualquer coisa.
      (select pr.allowed
         from public.permission_rules pr
        where pr.scope = 'user'
          and pr.user_id = p_user
          and pr.module = p_module
        limit 1),
      -- 2) Regra do cargo mais forte do usuário. Sem regra para esse cargo,
      --    cai no padrão liberado — mesmo que um cargo inferior esteja
      --    bloqueado.
      (select pr.allowed
         from public.permission_rules pr
        where pr.scope = 'role'
          and pr.module = p_module
          and pr.role_name = (
            select case
              when coalesce(p.is_admin, false)      then 'admin'
              when coalesce(p.is_ambassador, false) then 'ambassador'
            end
            from public.profiles p where p.id = p_user
          )
        limit 1),
      -- 3) Padrão: liberado.
      true
    )
  end;
$$;

grant execute on function public.can_write(uuid, text) to authenticated;

notify pgrst, 'reload schema';
