-- 155_services_ambassador_rls.sql
-- Substitui as policies antigas (ALL, admin-only) de transport/tourist_spots/
-- directory por policies de gestor granulares (INSERT/UPDATE/DELETE),
-- escopadas por cidade. Não altera SELECT público nem a policy de
-- submissão pública de directory ("Users can submit to directory.").

-- transport
drop policy if exists "Admins can manage transport" on public.transport;

drop policy if exists "transport_gestor_insert" on public.transport;
create policy "transport_gestor_insert"
  on public.transport for insert
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "transport_gestor_update" on public.transport;
create policy "transport_gestor_update"
  on public.transport for update
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  )
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "transport_gestor_delete" on public.transport;
create policy "transport_gestor_delete"
  on public.transport for delete
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

-- tourist_spots
drop policy if exists "Admins can manage tourist_spots" on public.tourist_spots;

drop policy if exists "tourist_spots_gestor_insert" on public.tourist_spots;
create policy "tourist_spots_gestor_insert"
  on public.tourist_spots for insert
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "tourist_spots_gestor_update" on public.tourist_spots;
create policy "tourist_spots_gestor_update"
  on public.tourist_spots for update
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  )
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "tourist_spots_gestor_delete" on public.tourist_spots;
create policy "tourist_spots_gestor_delete"
  on public.tourist_spots for delete
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

-- directory (mantém "Users can submit to directory." intacta — coexiste)
drop policy if exists "Admins can perform any action on directory" on public.directory;

drop policy if exists "directory_gestor_insert" on public.directory;
create policy "directory_gestor_insert"
  on public.directory for insert
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "directory_gestor_update" on public.directory;
create policy "directory_gestor_update"
  on public.directory for update
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  )
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "directory_gestor_delete" on public.directory;
create policy "directory_gestor_delete"
  on public.directory for delete
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

notify pgrst, 'reload schema';
