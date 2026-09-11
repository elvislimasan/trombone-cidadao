-- Reivindicacao publica de uma pagina legislativa. O pedido nao concede
-- acesso sozinho: somente um admin pode aprovar e efetivar o vinculo.

create table if not exists public.councilor_link_requests (
  id uuid primary key default gen_random_uuid(),
  councilor_id uuid not null references public.councilors(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (councilor_id, requester_id)
);

create index if not exists councilor_link_requests_pending_idx
  on public.councilor_link_requests(status, created_at)
  where status = 'pending';

alter table public.councilor_link_requests enable row level security;
grant select on public.councilor_link_requests to authenticated;

drop policy if exists councilor_link_requests_read on public.councilor_link_requests;
create policy councilor_link_requests_read on public.councilor_link_requests
  for select to authenticated
  using (
    requester_id = auth.uid()
    or coalesce((
      select p.is_admin or p.is_master
      from public.profiles p
      where p.id = auth.uid()
    ), false)
  );

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
        review_note = 'Outra solicitacao foi aprovada para esta pagina.',
        reviewed_at = now(),
        updated_at = now()
    where councilor_id = v_request.councilor_id
      and id <> v_request.id
      and status = 'pending';
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

revoke all on function public.request_councilor_link(uuid) from public;
grant execute on function public.request_councilor_link(uuid) to authenticated;
revoke all on function public.review_councilor_link_request(uuid, boolean, text) from public;
grant execute on function public.review_councilor_link_request(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
