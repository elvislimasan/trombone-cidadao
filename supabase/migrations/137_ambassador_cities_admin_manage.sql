-- 137_ambassador_cities_admin_manage.sql
-- As policies de INSERT/UPDATE/DELETE em ambassador_cities só permitiam master
-- (migration 121). Mas a hierarquia do projeto é "gestor = master OU admin", e a
-- página de gestão de embaixadores (/admin/embaixadores) libera acesso a ambos.
--
-- Efeito do bug: um ADMIN (não-master) que clica em "Suspender" dispara um UPDATE
-- bloqueado pela RLS → 0 linhas afetadas e error:null (falha silenciosa), então o
-- embaixador continua ativo na lista. Idem para aprovar candidatura (INSERT via RPC
-- roda como definer, ok) e remover.
--
-- Fix: permitir master OU admin em INSERT/UPDATE/DELETE.

drop policy if exists "ambassador_cities_insert" on public.ambassador_cities;
create policy "ambassador_cities_insert"
  on public.ambassador_cities for insert
  with check (
    public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  );

drop policy if exists "ambassador_cities_update" on public.ambassador_cities;
create policy "ambassador_cities_update"
  on public.ambassador_cities for update
  using (
    public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  );

drop policy if exists "ambassador_cities_delete" on public.ambassador_cities;
create policy "ambassador_cities_delete"
  on public.ambassador_cities for delete
  using (
    public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  );

notify pgrst, 'reload schema';
