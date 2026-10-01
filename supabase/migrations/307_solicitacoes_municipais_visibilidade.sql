begin;

alter table public.reports add column if not exists is_public boolean not null default true;
create index if not exists reports_municipal_internal_idx on public.reports (created_by_municipality, created_at desc)
  where moderation_status = 'internal';

-- A prefeitura decide a publicação. O estado interno nunca entra na fila de moderação.
create or replace function public.validate_municipal_report_author()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  if tg_op='UPDATE' and new.created_by_municipality is distinct from old.created_by_municipality then
    raise exception 'A origem municipal da bronca não pode ser alterada';
  end if;
  if new.created_by_municipality is null then
    if not new.is_public then raise exception 'Apenas solicitações municipais podem ser internas'; end if;
    return new;
  end if;
  select city_id into v_city from public.prefeituras
    where id=new.created_by_municipality and status='ativa';
  if v_city is null or new.city_id is distinct from v_city then
    raise exception 'Prefeitura ou cidade inválida para a solicitação';
  end if;
  if tg_op='INSERT' or new.is_public is distinct from old.is_public then
    if auth.uid() is null or (tg_op='INSERT' and new.author_id is distinct from auth.uid())
      or not public.pode_acessar_prefeitura(auth.uid(),v_city)
      or not (public.pode_administrar_prefeitura(auth.uid(),v_city) or exists (
        select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
        where m.user_id=auth.uid() and m.ativo and m.papel in ('gestor','operador') and c.city_id=v_city
      )) then raise exception 'Sem permissão para registrar ou publicar esta solicitação'; end if;
  end if;
  new.moderation_status=case when new.is_public then 'approved' else 'internal' end;
  new.is_anonymous=false;
  return new;
end $$;

drop trigger if exists zzzz_validate_municipal_report_author on public.reports;
create trigger zzzz_validate_municipal_report_author
  before insert or update of created_by_municipality,is_public,moderation_status on public.reports
  for each row execute function public.validate_municipal_report_author();

-- Recupera solicitações municipais já cadastradas que um gatilho anterior deixou pendentes.
update public.reports set moderation_status='approved'
  where created_by_municipality is not null and is_public and moderation_status='pending_approval';
alter table public.reports add constraint reports_internal_municipal_state_check
  check (is_public or (created_by_municipality is not null and moderation_status='internal'));

-- Política restritiva: também limita SELECTs concedidos por políticas antigas.
create policy reports_municipality_select_internal on public.reports for select to authenticated
  using (created_by_municipality is not null and public.pode_acessar_prefeitura(auth.uid(),city_id));
create policy reports_hide_internal_municipal on public.reports as restrictive for select
  using (is_public
    or author_id=auth.uid()
    or public.is_admin(auth.uid()) or public.is_master(auth.uid())
    or (created_by_municipality is not null and public.pode_acessar_prefeitura(auth.uid(),city_id)));

create policy report_media_municipality_select on public.report_media for select to authenticated
  using (exists (
    select 1 from public.reports r where r.id=report_media.report_id and r.created_by_municipality is not null
      and public.pode_acessar_prefeitura(auth.uid(),r.city_id)
  ));
-- Consulta com privilégio do banco para não depender da RLS de reports aqui.
-- Sem isso, o SELECT interno ficaria invisível para anon e o NOT EXISTS liberaria a mídia.
create or replace function public.can_view_municipal_report_media(p_report uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select not exists (
    select 1 from public.reports r where r.id=p_report and not r.is_public
      and r.author_id is distinct from auth.uid()
      and not (public.is_admin(auth.uid()) or public.is_master(auth.uid()))
      and not public.pode_acessar_prefeitura(auth.uid(),r.city_id)
  )
$$;
revoke all on function public.can_view_municipal_report_media(uuid) from public;
grant execute on function public.can_view_municipal_report_media(uuid) to anon,authenticated;
create policy report_media_hide_internal_municipal on public.report_media as restrictive for select
  using (public.can_view_municipal_report_media(report_id));

create or replace function public.set_municipal_report_publicity(p_report uuid, p_public boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_report public.reports%rowtype;
begin
  select * into v_report from public.reports where id=p_report for update;
  if not found or v_report.created_by_municipality is null then
    raise exception 'Solicitação municipal não encontrada';
  end if;
  if auth.uid() is null or not public.pode_acessar_prefeitura(auth.uid(),v_report.city_id)
    or not (public.pode_administrar_prefeitura(auth.uid(),v_report.city_id) or exists (
      select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
      where m.user_id=auth.uid() and m.ativo and m.papel in ('gestor','operador') and c.city_id=v_report.city_id
    )) then raise exception 'Sem permissão para alterar a visibilidade'; end if;
  update public.reports set is_public=p_public where id=p_report;
  return p_public;
end $$;
revoke all on function public.set_municipal_report_publicity(uuid,boolean) from public,anon;
grant execute on function public.set_municipal_report_publicity(uuid,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
