-- `reports` não possui a coluna `updated_at`. A primeira versão desta RPC
-- referenciava a coluna e fazia toda tentativa de vinculação falhar no UPDATE.
create or replace function public.link_duplicate_report(
  p_source_report_id uuid,
  p_target_report_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_source public.reports%rowtype;
  v_target public.reports%rowtype;
  v_global_manager boolean;
  v_city_manager boolean;
begin
  if auth.uid() is null then
    raise exception 'Faça login para vincular broncas';
  end if;
  if p_source_report_id = p_target_report_id then
    raise exception 'A bronca não pode ser vinculada a ela mesma';
  end if;

  select * into v_source
  from public.reports
  where id = p_source_report_id;

  select * into v_target
  from public.reports
  where id = p_target_report_id;

  if v_source.id is null or v_target.id is null then
    raise exception 'Bronca não encontrada';
  end if;
  if v_source.city_id is distinct from v_target.city_id then
    raise exception 'As broncas precisam pertencer à mesma cidade';
  end if;
  if v_target.status in ('duplicate', 'resolved', 'rejected') then
    raise exception 'Escolha uma bronca principal ativa';
  end if;
  if v_target.moderation_status is distinct from 'approved' then
    raise exception 'A bronca principal ainda não foi aprovada';
  end if;

  select coalesce(p.is_admin or p.is_master, false)
    into v_global_manager
  from public.profiles p
  where p.id = auth.uid();

  v_city_manager := public.is_ambassador_of(auth.uid(), v_source.city_id)
    and public.can_write(auth.uid(), 'moderation');

  if not coalesce(v_global_manager, false)
    and not coalesce(v_city_manager, false) then
    raise exception 'Você não tem permissão para vincular broncas nesta cidade';
  end if;

  update public.reports
  set status = 'duplicate',
      linked_to = p_target_report_id
  where id = p_source_report_id;

  return found;
end;
$fn$;

revoke all on function public.link_duplicate_report(uuid, uuid) from public;
grant execute on function public.link_duplicate_report(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
