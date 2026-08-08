-- 142_public_works_ambassador_rls.sql
-- Permite admin/master OU embaixador ativo da cidade gerir obras e moderar mídias.
-- SELECT permanece público (não tocado). Só adiciona policies de escopo.

-- helper inline: "é gestor da cidade da obra"
-- (usado via expressão nas policies; is_ambassador_of é SECURITY DEFINER)

-- ── public_works: INSERT/UPDATE/DELETE ──
drop policy if exists "works_gestor_insert" on public.public_works;
create policy "works_gestor_insert"
  on public.public_works for insert
  with check (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "works_gestor_update" on public.public_works;
create policy "works_gestor_update"
  on public.public_works for update
  using (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "works_gestor_delete" on public.public_works;
create policy "works_gestor_delete"
  on public.public_works for delete
  using (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );

-- ── public_work_media: INSERT/UPDATE/DELETE via obra-pai ──
drop policy if exists "work_media_gestor_insert" on public.public_work_media;
create policy "work_media_gestor_insert"
  on public.public_work_media for insert
  with check (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_media.work_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

drop policy if exists "work_media_gestor_update" on public.public_work_media;
create policy "work_media_gestor_update"
  on public.public_work_media for update
  using (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_media.work_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

drop policy if exists "work_media_gestor_delete" on public.public_work_media;
create policy "work_media_gestor_delete"
  on public.public_work_media for delete
  using (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_media.work_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

notify pgrst, 'reload schema';
