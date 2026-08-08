-- 152_pavement_streets_ambassador_rls.sql
-- Substitui a policy antiga "Admins can manage pavment street" (só admin,
-- sem master/embaixador) por uma policy de gestor escopada por cidade,
-- espelhando o padrão de public_works/rental_properties. Não altera a
-- policy de SELECT público existente.

drop policy if exists "Admins can manage pavment street" on public.pavement_streets;

drop policy if exists "pavement_streets_gestor_insert" on public.pavement_streets;
create policy "pavement_streets_gestor_insert"
  on public.pavement_streets for insert
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "pavement_streets_gestor_update" on public.pavement_streets;
create policy "pavement_streets_gestor_update"
  on public.pavement_streets for update
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "pavement_streets_gestor_delete" on public.pavement_streets;
create policy "pavement_streets_gestor_delete"
  on public.pavement_streets for delete
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

notify pgrst, 'reload schema';
