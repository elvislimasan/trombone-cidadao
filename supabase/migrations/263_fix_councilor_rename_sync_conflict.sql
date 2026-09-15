-- Evita que o gatilho de sincronizacao recrie o vereador durante uma renomeacao.
--
-- A versao anterior atualizava primeiro os documentos das ruas. Cada update
-- dispara sync_councilors_from_street(), que encontrava o novo nome antes de o
-- perfil atual assumir a nova chave e criava outro councilor. O update final do
-- perfil entao falhava na constraint unique (city_id, normalized_name).
create or replace function public.rename_councilor_profile(
  p_councilor_id uuid,
  p_new_name text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_councilor public.councilors%rowtype;
  v_new_name text := btrim(coalesce(p_new_name, ''));
  v_new_key text;
  v_street record;
  v_document jsonb;
  v_author jsonb;
  v_authors jsonb;
  v_new_authors jsonb;
  v_new_documents jsonb;
  v_author_name text;
  v_author_key text;
  v_document_changed boolean;
  v_street_changed boolean;
  v_updated integer := 0;
  v_allowed boolean;
begin
  if auth.uid() is null then raise exception 'Faca login para editar o vereador'; end if;
  if v_new_name = '' then raise exception 'Informe o nome do vereador'; end if;

  select * into v_councilor
  from public.councilors
  where id = p_councilor_id
  for update;

  if v_councilor.id is null then raise exception 'Vereador nao encontrado'; end if;

  v_allowed := coalesce((
    select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()
  ), false) or (
    public.is_ambassador_of(auth.uid(), v_councilor.city_id)
    and public.can_write(auth.uid(), 'pavement')
  );
  if not v_allowed then raise exception 'Voce nao tem permissao para editar este vereador'; end if;

  v_new_key := public.normalized_councilor_name(v_new_name);
  if v_new_key is null then raise exception 'Informe um nome valido'; end if;
  if exists (
    select 1 from public.councilors c
    where c.city_id = v_councilor.city_id
      and c.normalized_name = v_new_key
      and c.id <> v_councilor.id
  ) then
    raise exception 'Ja existe um vereador com esse nome nesta cidade';
  end if;

  -- O perfil precisa assumir a nova chave antes das ruas. Assim, quando o
  -- gatilho sincronizar cada rua, o conflito ocorre com o proprio perfil e o
  -- upsert nao cria um cadastro temporario duplicado.
  update public.councilors
  set name = v_new_name,
      normalized_name = v_new_key,
      slug = public.councilor_slug(v_new_name),
      updated_at = now()
  where id = v_councilor.id;

  for v_street in
    select id, historical_documents
    from public.pavement_streets
    where city_id = v_councilor.city_id
    for update
  loop
    v_new_documents := '[]'::jsonb;
    v_street_changed := false;

    for v_document in
      select value from jsonb_array_elements(coalesce(v_street.historical_documents, '[]'::jsonb))
    loop
      v_document_changed := false;
      if v_document->>'kind' = 'projeto_lei' then
        v_authors := case
          when jsonb_typeof(v_document->'councilor_authors') = 'array'
            and jsonb_array_length(v_document->'councilor_authors') > 0
            then v_document->'councilor_authors'
          else jsonb_build_array(v_document->>'councilor_author')
        end;
        v_new_authors := '[]'::jsonb;

        for v_author in select value from jsonb_array_elements(v_authors) loop
          v_author_name := btrim(coalesce(v_author #>> '{}', ''));
          if public.normalized_councilor_name(v_author_name) = v_councilor.normalized_name then
            v_author_name := v_new_name;
            v_document_changed := true;
          end if;
          v_author_key := public.normalized_councilor_name(v_author_name);
          if v_author_key is not null and not exists (
            select 1
            from jsonb_array_elements_text(v_new_authors) existing(name)
            where public.normalized_councilor_name(existing.name) = v_author_key
          ) then
            v_new_authors := v_new_authors || jsonb_build_array(v_author_name);
          end if;
        end loop;

        if v_document_changed then
          v_document := jsonb_set(v_document - 'councilor_author', '{councilor_authors}', v_new_authors, true);
          v_street_changed := true;
        end if;
      end if;
      v_new_documents := v_new_documents || jsonb_build_array(v_document);
    end loop;

    if v_street_changed then
      update public.pavement_streets
      set historical_documents = v_new_documents
      where id = v_street.id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return v_updated;
end;
$fn$;

revoke all on function public.rename_councilor_profile(uuid, text) from public;
grant execute on function public.rename_councilor_profile(uuid, text) to authenticated;

notify pgrst, 'reload schema';
