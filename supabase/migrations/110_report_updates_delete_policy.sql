-- Política de DELETE para report_updates
-- Admin: pode excluir qualquer atualização (qualquer status)
-- Autor da atualização: só pode excluir a própria se ainda não confirmada

create policy "Admins can delete any update"
  on public.report_updates for delete
  to authenticated
  using (
    exists (
      select 1 from public.moderation_admins
      where user_id = auth.uid()
    )
  );

create policy "Authors can delete own non-confirmed updates"
  on public.report_updates for delete
  to authenticated
  using (
    auth.uid() = author_id
    and status in ('pending_moderation', 'pending')
  );

-- Mesma lógica para as mídias das atualizações
create policy "Admins can delete any update media"
  on public.report_update_media for delete
  to authenticated
  using (
    exists (
      select 1 from public.moderation_admins
      where user_id = auth.uid()
    )
  );

create policy "Authors can delete own update media"
  on public.report_update_media for delete
  to authenticated
  using (
    exists (
      select 1 from public.report_updates ru
      where ru.id = report_update_id
        and ru.author_id = auth.uid()
        and ru.status in ('pending_moderation', 'pending')
    )
  );

notify pgrst, 'reload schema';
