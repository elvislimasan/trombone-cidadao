-- Corrige a policy de DELETE que falhava com "permission denied for table moderation_admins"
-- A policy rodava como o usuário autenticado, sem acesso à tabela moderation_admins.
-- Solução: função security definer (mesma abordagem de can_user_submit_update).

create or replace function public.is_moderation_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.moderation_admins
    where user_id = p_user_id
  )
$$;

-- Remove policies antigas com o subquery direto
drop policy if exists "Admins can delete any update" on public.report_updates;
drop policy if exists "Authors can delete own non-confirmed updates" on public.report_updates;
drop policy if exists "Admins can delete any update media" on public.report_update_media;
drop policy if exists "Authors can delete own update media" on public.report_update_media;

-- Recria usando a função security definer
create policy "Admins can delete any update"
  on public.report_updates for delete
  to authenticated
  using (public.is_moderation_admin(auth.uid()));

create policy "Authors can delete own non-confirmed updates"
  on public.report_updates for delete
  to authenticated
  using (
    auth.uid() = author_id
    and status in ('pending_moderation', 'pending')
  );

create policy "Admins can delete any update media"
  on public.report_update_media for delete
  to authenticated
  using (
    exists (
      select 1 from public.report_updates ru
      where ru.id = report_update_id
        and public.is_moderation_admin(auth.uid())
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
