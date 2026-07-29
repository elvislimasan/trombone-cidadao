-- 153_pavement_streets_update_with_check.sql
-- A policy "pavement_streets_gestor_update" criada em 152 tinha apenas
-- `using`, sem `with check`. Isso permite (via chamada direta à API,
-- contornando o client) que um embaixador altere o city_id de uma rua da
-- sua cidade para uma cidade que ele não gerencia, já que `using` só
-- valida a linha ANTES do update, não a linha resultante. Adiciona
-- `with check` com a mesma expressão de gestor para fechar essa lacuna.

drop policy if exists "pavement_streets_gestor_update" on public.pavement_streets;
create policy "pavement_streets_gestor_update"
  on public.pavement_streets for update
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  )
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

notify pgrst, 'reload schema';
