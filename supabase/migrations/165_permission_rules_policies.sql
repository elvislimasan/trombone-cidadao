-- 165_permission_rules_policies.sql
-- Aplica can_write() nas policies de ESCRITA de gestor/moderador.
-- Não altera policies de cidadão comum: um embaixador sem permissão de
-- moderação continua podendo criar/editar as próprias broncas.
-- Com permission_rules vazia, can_write() retorna true e nada muda.

-- ── works: public_works ──────────────────────────────────────────────────
drop policy if exists works_gestor_insert on public.public_works;
create policy works_gestor_insert on public.public_works for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'works')
  );

drop policy if exists works_gestor_update on public.public_works;
create policy works_gestor_update on public.public_works for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'works')
  );

drop policy if exists works_gestor_delete on public.public_works;
create policy works_gestor_delete on public.public_works for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'works')
  );

-- A policy ALL de admin também precisa da checagem, senão um admin bloqueado
-- continuaria passando por ela.
drop policy if exists "Admins can perform any action on public_works" on public.public_works;
create policy "Admins can perform any action on public_works" on public.public_works
  for all
  using (public.is_admin(auth.uid()) and public.can_write(auth.uid(), 'works'))
  with check (public.is_admin(auth.uid()) and public.can_write(auth.uid(), 'works'));

-- ── rentals: rental_properties ───────────────────────────────────────────
drop policy if exists rental_properties_gestor_insert on public.rental_properties;
create policy rental_properties_gestor_insert on public.rental_properties for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'rentals')
  );

drop policy if exists rental_properties_gestor_update on public.rental_properties;
create policy rental_properties_gestor_update on public.rental_properties for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'rentals')
  );

drop policy if exists rental_properties_gestor_delete on public.rental_properties;
create policy rental_properties_gestor_delete on public.rental_properties for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'rentals')
  );

-- ── pavement: pavement_streets ───────────────────────────────────────────
drop policy if exists pavement_streets_gestor_insert on public.pavement_streets;
create policy pavement_streets_gestor_insert on public.pavement_streets for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'pavement')
  );

drop policy if exists pavement_streets_gestor_update on public.pavement_streets;
create policy pavement_streets_gestor_update on public.pavement_streets for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'pavement')
  )
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'pavement')
  );

drop policy if exists pavement_streets_gestor_delete on public.pavement_streets;
create policy pavement_streets_gestor_delete on public.pavement_streets for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'pavement')
  );

-- ── services: transport, tourist_spots, directory ────────────────────────
drop policy if exists transport_gestor_insert on public.transport;
create policy transport_gestor_insert on public.transport for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists transport_gestor_update on public.transport;
create policy transport_gestor_update on public.transport for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists transport_gestor_delete on public.transport;
create policy transport_gestor_delete on public.transport for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists tourist_spots_gestor_insert on public.tourist_spots;
create policy tourist_spots_gestor_insert on public.tourist_spots for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists tourist_spots_gestor_update on public.tourist_spots;
create policy tourist_spots_gestor_update on public.tourist_spots for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists tourist_spots_gestor_delete on public.tourist_spots;
create policy tourist_spots_gestor_delete on public.tourist_spots for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists directory_gestor_insert on public.directory;
create policy directory_gestor_insert on public.directory for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists directory_gestor_update on public.directory;
create policy directory_gestor_update on public.directory for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists directory_gestor_delete on public.directory;
create policy directory_gestor_delete on public.directory for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

-- ── moderation: reports, report_updates ──────────────────────────────────
drop policy if exists ambassadors_can_update_reports on public.reports;
create policy ambassadors_can_update_reports on public.reports for update
  using (public.is_ambassador_of(auth.uid(), city_id)
         and public.can_write(auth.uid(), 'moderation'));

drop policy if exists ambassadors_can_delete_reports on public.reports;
create policy ambassadors_can_delete_reports on public.reports for delete
  using (public.is_ambassador_of(auth.uid(), city_id)
         and public.can_write(auth.uid(), 'moderation'));

drop policy if exists ambassadors_can_update_report_updates on public.report_updates;
create policy ambassadors_can_update_report_updates on public.report_updates for update
  using (exists (
    select 1 from public.reports r
     where r.id = report_updates.report_id
       and public.is_ambassador_of(auth.uid(), r.city_id)
  ) and public.can_write(auth.uid(), 'moderation'));

drop policy if exists ambassadors_can_delete_report_updates on public.report_updates;
create policy ambassadors_can_delete_report_updates on public.report_updates for delete
  using (exists (
    select 1 from public.reports r
     where r.id = report_updates.report_id
       and public.is_ambassador_of(auth.uid(), r.city_id)
  ) and public.can_write(auth.uid(), 'moderation'));

drop policy if exists "Admins can perform any action on reports" on public.reports;
create policy "Admins can perform any action on reports" on public.reports
  for all
  using (public.is_admin(auth.uid()) and public.can_write(auth.uid(), 'moderation'))
  with check (public.is_admin(auth.uid()) and public.can_write(auth.uid(), 'moderation'));

notify pgrst, 'reload schema';
