begin;

-- Funcionários ativos editam ruas existentes somente na cidade da prefeitura.
-- As policies de criação/exclusão de ruas e gestão de bairros são preservadas.
create function public.pode_editar_ruas_municipais(p_city_id bigint)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.can_write(auth.uid(), 'pavement')
    and public.pode_acessar_prefeitura(auth.uid(), p_city_id)
$$;
revoke all on function public.pode_editar_ruas_municipais(bigint) from public, anon;
grant execute on function public.pode_editar_ruas_municipais(bigint) to authenticated;

create policy pavement_streets_municipal_update on public.pavement_streets
  for update to authenticated
  using (public.pode_editar_ruas_municipais(city_id))
  with check (public.pode_editar_ruas_municipais(city_id));

create function public.pode_editar_anexo_rua_municipal(p_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.pavement_streets s
    where s.id::text = split_part(p_name, '/', 2)
      and s.city_id::text = split_part(p_name, '/', 1)
      and public.pode_editar_ruas_municipais(s.city_id)
  )
$$;
revoke all on function public.pode_editar_anexo_rua_municipal(text) from public, anon;
grant execute on function public.pode_editar_anexo_rua_municipal(text) to authenticated;

create policy pavement_history_municipal_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'pavement-history' and public.pode_editar_anexo_rua_municipal(name)
  );
create policy pavement_history_municipal_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'pavement-history' and public.pode_editar_anexo_rua_municipal(name)
  );

notify pgrst, 'reload schema';
commit;
