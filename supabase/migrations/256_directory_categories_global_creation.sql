-- Novas categorias do Guia são globais e podem ser reutilizadas em qualquer
-- cidade. Embaixadores com permissão de Serviços podem criar categorias, mas
-- somente admin/master altera ou remove uma categoria global já compartilhada.

drop policy if exists directory_categories_managers_insert on public.directory_categories;
create policy directory_categories_managers_insert on public.directory_categories
  for insert to authenticated with check (
    coalesce((
      select p.is_admin or p.is_master
      from public.profiles p
      where p.id = auth.uid()
    ), false)
    or (
      city_id is null
      and public.can_write(auth.uid(), 'services')
      and exists (
        select 1
        from public.ambassador_cities ac
        where ac.user_id = auth.uid()
          and ac.status = 'active'
      )
    )
  );

drop policy if exists directory_categories_managers_update on public.directory_categories;
create policy directory_categories_managers_update on public.directory_categories
  for update to authenticated using (
    coalesce((
      select p.is_admin or p.is_master
      from public.profiles p
      where p.id = auth.uid()
    ), false)
    or (
      city_id is not null
      and public.is_ambassador_of(auth.uid(), city_id)
      and public.can_write(auth.uid(), 'services')
    )
  ) with check (
    coalesce((
      select p.is_admin or p.is_master
      from public.profiles p
      where p.id = auth.uid()
    ), false)
    or (
      city_id is not null
      and public.is_ambassador_of(auth.uid(), city_id)
      and public.can_write(auth.uid(), 'services')
    )
  );

drop policy if exists directory_categories_managers_delete on public.directory_categories;
create policy directory_categories_managers_delete on public.directory_categories
  for delete to authenticated using (
    coalesce((
      select p.is_admin or p.is_master
      from public.profiles p
      where p.id = auth.uid()
    ), false)
    or (
      city_id is not null
      and public.is_ambassador_of(auth.uid(), city_id)
      and public.can_write(auth.uid(), 'services')
    )
  );

notify pgrst, 'reload schema';
