-- 146_measurements_ambassador_rls.sql
-- As policies de public_work_measurements (migration 058) só permitiam is_admin.
-- Embaixador (e master) ficavam bloqueados ao criar/editar/excluir fases de obra
-- da própria cidade → "new row violates row-level security policy".
--
-- Adiciona policies de gestor escopadas pela cidade da OBRA-PAI (via work_id),
-- espelhando a 142 (public_works / public_work_media). Não altera as policies
-- de admin nem a de SELECT (pública) já existentes — apenas ADICIONA.

drop policy if exists "measurements_gestor_insert" on public.public_work_measurements;
create policy "measurements_gestor_insert"
  on public.public_work_measurements for insert
  with check (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_measurements.work_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

drop policy if exists "measurements_gestor_update" on public.public_work_measurements;
create policy "measurements_gestor_update"
  on public.public_work_measurements for update
  using (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_measurements.work_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

drop policy if exists "measurements_gestor_delete" on public.public_work_measurements;
create policy "measurements_gestor_delete"
  on public.public_work_measurements for delete
  using (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_measurements.work_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

notify pgrst, 'reload schema';
