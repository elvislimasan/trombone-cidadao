-- Uma categoria com locais ou subcategorias não pode desaparecer do Guia.
-- A FK de locais usa SET NULL e a de subcategorias usa CASCADE; sem esta
-- proteção, uma exclusão poderia deixar locais sem categoria e apagar filhos.
create or replace function public.prevent_directory_category_delete_in_use()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if exists (select 1 from public.directory_categories where parent_id = old.id) then
    raise exception 'Mova ou remova as subcategorias antes de excluir esta categoria';
  end if;
  if exists (select 1 from public.directory where category_id = old.id) then
    raise exception 'Mova ou remova os locais antes de excluir esta categoria';
  end if;
  return old;
end;
$fn$;

drop trigger if exists directory_category_delete_in_use on public.directory_categories;
create trigger directory_category_delete_in_use
before delete on public.directory_categories
for each row execute function public.prevent_directory_category_delete_in_use();

revoke all on function public.prevent_directory_category_delete_in_use() from public, anon, authenticated;
