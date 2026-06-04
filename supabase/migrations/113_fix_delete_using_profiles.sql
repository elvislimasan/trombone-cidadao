-- Remove todas as tentativas anteriores de policy de DELETE
drop policy if exists "Admins can delete any update"                  on public.report_updates;
drop policy if exists "Authors can delete own non-confirmed updates"  on public.report_updates;
drop policy if exists "Admins can delete any update media"            on public.report_update_media;
drop policy if exists "Authors can delete own update media"           on public.report_update_media;

-- Remove função RPC que não funcionava por auth.uid() vazio em security definer
drop function if exists public.delete_report_update(uuid);

-- ── Políticas usando profiles.is_admin ───────────────────────────────────────
-- profiles tem policy "users can view own profile" → auth.uid() = id funciona ✓
-- Não depende de moderation_admins (que causava permission denied)

create policy "delete report_updates"
  on public.report_updates for delete
  to authenticated
  using (
    -- Autor pode excluir a própria enquanto não confirmada
    (auth.uid() = author_id and status in ('pending_moderation', 'pending'))
    or
    -- Admin pode excluir qualquer
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

create policy "delete report_update_media"
  on public.report_update_media for delete
  to authenticated
  using (
    exists (
      select 1 from public.report_updates ru
      where ru.id = report_update_id
        and (
          (auth.uid() = ru.author_id and ru.status in ('pending_moderation', 'pending'))
          or exists (
            select 1 from public.profiles
            where id = auth.uid() and is_admin = true
          )
        )
    )
  );

notify pgrst, 'reload schema';
