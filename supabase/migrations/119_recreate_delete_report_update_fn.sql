-- Recria a RPC delete_report_update removida na migration 113.
-- Usa profiles.is_admin em vez de moderation_admins (corrige o bug original da 112).

create or replace function public.delete_report_update(p_update_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_status    text;
  v_is_admin  boolean;
begin
  select author_id, status
    into v_author_id, v_status
    from public.report_updates
   where id = p_update_id;

  if not found then
    raise exception 'Atualização não encontrada';
  end if;

  select coalesce(is_admin, false)
    into v_is_admin
    from public.profiles
   where id = auth.uid();

  if not (
    v_is_admin
    or (auth.uid() = v_author_id and v_status in ('pending_moderation', 'pending'))
  ) then
    raise exception 'Sem permissão para excluir esta atualização';
  end if;

  delete from public.report_update_media where report_update_id = p_update_id;
  delete from public.report_updates where id = p_update_id;
end;
$$;

grant execute on function public.delete_report_update(uuid) to authenticated;

notify pgrst, 'reload schema';
