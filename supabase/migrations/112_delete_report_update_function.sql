-- Função security definer para excluir uma atualização de bronca.
-- Contorna o problema de RLS silencioso (Supabase retorna erro: null mesmo sem deletar).
-- Admin: exclui qualquer status. Autor: só pending_moderation e pending.

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
  -- Busca dados da atualização
  select author_id, status
    into v_author_id, v_status
    from public.report_updates
   where id = p_update_id;

  if not found then
    raise exception 'Atualização não encontrada';
  end if;

  -- Verifica se é admin
  select exists (
    select 1 from public.moderation_admins where user_id = auth.uid()
  ) into v_is_admin;

  -- Permissão: admin qualquer status, autor só não confirmada
  if not (
    v_is_admin
    or (auth.uid() = v_author_id and v_status in ('pending_moderation', 'pending'))
  ) then
    raise exception 'Sem permissão para excluir esta atualização';
  end if;

  -- Remove mídias
  delete from public.report_update_media where report_update_id = p_update_id;

  -- Remove a atualização
  delete from public.report_updates where id = p_update_id;
end;
$$;

notify pgrst, 'reload schema';
