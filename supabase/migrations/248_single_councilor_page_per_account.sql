-- Uma conta representa uma unica identidade legislativa. A interface evita a
-- segunda solicitacao, mas esta regra precisa existir no banco para cobrir RPC,
-- painel administrativo e chamadas diretas concorrentes.

update public.councilor_link_requests r
set status = 'cancelled',
    review_note = 'Cancelada automaticamente porque a conta já possui uma página legislativa vinculada.',
    reviewed_at = now(),
    updated_at = now()
where r.status = 'pending'
  and exists (
    select 1
    from public.councilors c
    where c.user_id = r.requester_id
  );

create unique index if not exists councilors_one_page_per_account_idx
  on public.councilors(user_id)
  where user_id is not null;

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
  if p_user_id is not null and exists (
    select 1 from public.councilors
    where user_id = p_user_id
      and id <> p_councilor_id
  ) then
    raise exception 'Esta conta ja possui uma pagina legislativa vinculada';
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

create or replace function public.request_councilor_link(p_councilor_id uuid)
returns public.councilor_link_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_councilor public.councilors%rowtype;
  v_request public.councilor_link_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Faca login ou crie uma conta para solicitar o vinculo'; end if;

  if exists (select 1 from public.councilors where user_id = auth.uid()) then
    raise exception 'Esta conta ja possui uma pagina legislativa vinculada';
  end if;

  select * into v_councilor
  from public.councilors
  where id = p_councilor_id
  for update;

  if v_councilor.id is null then raise exception 'Pagina legislativa nao encontrada'; end if;
  if v_councilor.user_id is not null or v_councilor.claim_status <> 'unclaimed' then
    raise exception 'Esta pagina ja possui uma conta responsavel';
  end if;

  insert into public.councilor_link_requests (
    councilor_id, requester_id, status, reviewer_id, review_note, reviewed_at
  ) values (
    p_councilor_id, auth.uid(), 'pending', null, null, null
  )
  on conflict (councilor_id, requester_id) do update
    set status = 'pending',
        reviewer_id = null,
        review_note = null,
        reviewed_at = null,
        updated_at = now()
  returning * into v_request;

  return v_request;
end;
$fn$;

create or replace function public.review_councilor_link_request(
  p_request_id uuid,
  p_approve boolean,
  p_review_note text default null
)
returns public.councilor_link_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_request public.councilor_link_requests%rowtype;
  v_councilor public.councilors%rowtype;
  v_is_admin boolean;
begin
  v_is_admin := coalesce((
    select p.is_admin or p.is_master
    from public.profiles p
    where p.id = auth.uid()
  ), false);
  if not v_is_admin then raise exception 'Somente administradores podem analisar solicitacoes'; end if;

  select * into v_request
  from public.councilor_link_requests
  where id = p_request_id
  for update;

  if v_request.id is null then raise exception 'Solicitacao nao encontrada'; end if;
  if v_request.status <> 'pending' then raise exception 'Esta solicitacao ja foi analisada'; end if;

  if p_approve then
    if exists (
      select 1 from public.councilors
      where user_id = v_request.requester_id
        and id <> v_request.councilor_id
    ) then
      raise exception 'Esta conta ja possui uma pagina legislativa vinculada';
    end if;

    select * into v_councilor
    from public.councilors
    where id = v_request.councilor_id
    for update;

    if v_councilor.user_id is not null or v_councilor.claim_status <> 'unclaimed' then
      raise exception 'A pagina ja possui uma conta responsavel';
    end if;

    update public.councilors
    set user_id = v_request.requester_id,
        claim_status = 'linked',
        linked_at = now(),
        verified_at = null,
        verified_by = null,
        updated_at = now()
    where id = v_request.councilor_id;

    update public.councilor_link_requests
    set status = 'rejected',
        reviewer_id = auth.uid(),
        review_note = case
          when councilor_id = v_request.councilor_id then 'Outra solicitação foi aprovada para esta página.'
          else 'A conta foi vinculada a outra página legislativa.'
        end,
        reviewed_at = now(),
        updated_at = now()
    where id <> v_request.id
      and status = 'pending'
      and (
        councilor_id = v_request.councilor_id
        or requester_id = v_request.requester_id
      );
  end if;

  update public.councilor_link_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewer_id = auth.uid(),
      review_note = nullif(btrim(p_review_note), ''),
      reviewed_at = now(),
      updated_at = now()
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$fn$;

revoke all on function public.set_councilor_account_link(uuid, uuid, boolean) from public;
grant execute on function public.set_councilor_account_link(uuid, uuid, boolean) to authenticated;
revoke all on function public.request_councilor_link(uuid) from public;
grant execute on function public.request_councilor_link(uuid) to authenticated;
revoke all on function public.review_councilor_link_request(uuid, boolean, text) from public;
grant execute on function public.review_councilor_link_request(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
