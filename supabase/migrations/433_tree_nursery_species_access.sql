begin;

-- Quem gerencia os viveiros também mantém o catálogo de espécies da cidade.
-- Não concede edição de city_id nem acesso de escrita ao inventário de árvores.
alter policy tree_species_insert on public.city_tree_species
  with check (public.can_manage_tree_adoption(city_id));

alter policy tree_species_image_update on public.city_tree_species
  using (public.can_manage_tree_adoption(city_id))
  with check (public.can_manage_tree_adoption(city_id));

notify pgrst, 'reload schema';
commit;
