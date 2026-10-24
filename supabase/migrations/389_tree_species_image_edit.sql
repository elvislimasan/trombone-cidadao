begin;

-- Permite atualizar somente a ilustração, sem liberar mudança de cidade ou
-- dados botânicos que já estão associados aos registros do inventário.
grant update (illustration_url) on public.city_tree_species to authenticated;
create policy tree_species_image_update on public.city_tree_species
  for update to authenticated
  using (public.pode_gerenciar_arborizacao(city_id))
  with check (public.pode_gerenciar_arborizacao(city_id));

notify pgrst, 'reload schema';
commit;
