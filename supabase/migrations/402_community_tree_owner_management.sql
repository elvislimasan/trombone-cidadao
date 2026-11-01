begin;

-- Owner changes are RPC-only. Altering a tree returns its public profile to
-- review; its private diary is preserved. Versions prevent lost edits.
alter table public.community_tree_care add column updated_at timestamptz not null default now();

create function public.update_community_tree(p_tree jsonb,p_expected_updated_at timestamptz) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.community_trees; v_species uuid; v_date date;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para editar a árvore.' using errcode='42501'; end if;
  select * into t from public.community_trees where id=(p_tree->>'id')::uuid for update;
  if not found or t.author_id is distinct from auth.uid() then raise exception 'Cadastro indisponível.' using errcode='42501'; end if;
  if p_expected_updated_at is null or t.updated_at is distinct from p_expected_updated_at then raise exception 'O cadastro mudou. Atualize a página antes de editar.' using errcode='40001'; end if;
  if (p_tree->>'city_id')::bigint is distinct from t.city_id then raise exception 'A cidade do cadastro não pode ser alterada.'; end if;
  if coalesce(length(trim(p_tree->>'name')),0) not between 3 and 100 then raise exception 'Informe um nome de 3 a 100 caracteres.'; end if;
  if jsonb_typeof(p_tree->'latitude') is distinct from 'number' or jsonb_typeof(p_tree->'longitude') is distinct from 'number'
    or (p_tree->>'latitude')::numeric not between -90 and 90 or (p_tree->>'longitude')::numeric not between -180 and 180 then raise exception 'Marque a localização da árvore.'; end if;
  if length(coalesce(p_tree->>'address',''))>300 then raise exception 'Use até 300 caracteres no endereço.'; end if;
  v_species=nullif(p_tree->>'species_id','')::uuid;
  if v_species is not null and not exists(select 1 from public.city_tree_species where id=v_species and city_id=t.city_id) then raise exception 'Selecione uma espécie desta cidade.'; end if;
  v_date=nullif(p_tree->>'planted_on','')::date;
  if v_date>current_date then raise exception 'A data do plantio não pode estar no futuro.'; end if;
  if coalesce(p_tree->>'location_visibility','') not in ('city','exact') or jsonb_typeof(p_tree->'public_profile') is distinct from 'boolean' then raise exception 'Revise a privacidade da árvore.'; end if;
  if not coalesce(public.valid_community_photo(p_tree->>'cover_photo',t.id,auth.uid()),false) then raise exception 'Envie uma foto da árvore.'; end if;
  update public.community_trees set name=trim(p_tree->>'name'),species_id=v_species,
    latitude=(p_tree->>'latitude')::double precision,longitude=(p_tree->>'longitude')::double precision,
    address=nullif(trim(p_tree->>'address'),''),planted_on=v_date,cover_photo=p_tree->>'cover_photo',
    public_profile=(p_tree->>'public_profile')::boolean,location_visibility=p_tree->>'location_visibility',
    status='pending',review_note=null,reviewed_by=null,reviewed_at=null,updated_at=clock_timestamp()
    where id=t.id;
  return t.id;
end $$;
revoke all on function public.update_community_tree(jsonb,timestamptz) from public,anon;
grant execute on function public.update_community_tree(jsonb,timestamptz) to authenticated;

create function public.delete_community_tree(p_id uuid,p_expected_updated_at timestamptz) returns text[]
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.community_trees; v_paths text[];
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para excluir a árvore.' using errcode='42501'; end if;
  select * into t from public.community_trees where id=p_id for update;
  if not found then return array[]::text[]; end if;
  if t.author_id is distinct from auth.uid() then raise exception 'Cadastro indisponível.' using errcode='42501'; end if;
  if p_expected_updated_at is null or t.updated_at is distinct from p_expected_updated_at then raise exception 'O cadastro mudou. Atualize a página antes de excluir.' using errcode='40001'; end if;
  select coalesce(array_agg(distinct p.photo_path),array[]::text[]) into v_paths from (
    select t.cover_photo as photo_path union all select c.photo_path from public.community_tree_care c where c.tree_id=t.id
  ) p where p.photo_path is not null;
  delete from public.community_trees where id=t.id;
  return v_paths;
end $$;
revoke all on function public.delete_community_tree(uuid,timestamptz) from public,anon;
grant execute on function public.delete_community_tree(uuid,timestamptz) to authenticated;

create function public.update_community_tree_care(p_care jsonb,p_expected_updated_at timestamptz) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.community_trees; c public.community_tree_care; v_photo text; v_date date;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para editar o cuidado.' using errcode='42501'; end if;
  select * into t from public.community_trees where id=(p_care->>'tree_id')::uuid for share;
  if not found or t.author_id is distinct from auth.uid() then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  select * into c from public.community_tree_care where id=(p_care->>'id')::uuid and tree_id=t.id for update;
  if not found or c.author_id is distinct from auth.uid() then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if p_expected_updated_at is null or c.updated_at is distinct from p_expected_updated_at then raise exception 'O cuidado mudou. Atualize a página antes de editar.' using errcode='40001'; end if;
  if coalesce(p_care->>'action','') not in ('watering','growth','observation') then raise exception 'Escolha o tipo de cuidado.'; end if;
  v_date=(p_care->>'performed_on')::date;
  if v_date is null or v_date>current_date then raise exception 'Informe a data do cuidado, até hoje.'; end if;
  if length(coalesce(p_care->>'notes',''))>1500 or jsonb_typeof(p_care->'is_public') is distinct from 'boolean' then raise exception 'Revise a observação e a privacidade.'; end if;
  v_photo=nullif(p_care->>'photo_path','');
  if v_photo is not null and not coalesce(public.valid_community_photo(v_photo,t.id,auth.uid()),false) then raise exception 'Envie uma foto válida para esta árvore.'; end if;
  update public.community_tree_care set action=p_care->>'action',performed_on=v_date,notes=nullif(trim(p_care->>'notes'),''),
    photo_path=v_photo,is_public=(p_care->>'is_public')::boolean,updated_at=clock_timestamp() where id=c.id;
  -- Moderation flags and reports are never reset by an owner edit.
  return c.id;
end $$;
revoke all on function public.update_community_tree_care(jsonb,timestamptz) from public,anon;
grant execute on function public.update_community_tree_care(jsonb,timestamptz) to authenticated;

create function public.delete_community_tree_care(p_id uuid,p_expected_updated_at timestamptz) returns text[]
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.community_trees; c public.community_tree_care;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para excluir o cuidado.' using errcode='42501'; end if;
  select * into c from public.community_tree_care where id=p_id;
  if not found then return array[]::text[]; end if;
  select * into t from public.community_trees where id=c.tree_id for share;
  if not found or t.author_id is distinct from auth.uid() then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  select * into c from public.community_tree_care where id=p_id and tree_id=t.id for update;
  if not found then return array[]::text[]; end if;
  if c.author_id is distinct from auth.uid() then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if p_expected_updated_at is null or c.updated_at is distinct from p_expected_updated_at then raise exception 'O cuidado mudou. Atualize a página antes de excluir.' using errcode='40001'; end if;
  delete from public.community_tree_care where id=c.id;
  return case when c.photo_path is null then array[]::text[] else array[c.photo_path] end;
end $$;
revoke all on function public.delete_community_tree_care(uuid,timestamptz) from public,anon;
grant execute on function public.delete_community_tree_care(uuid,timestamptz) to authenticated;

create or replace function public.list_community_tree_care(p_tree uuid,p_limit integer default 30,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t public.community_trees; v_private boolean;
begin
  select * into t from public.community_trees where id=p_tree;
  if not found or public.get_community_tree(p_tree) is null then return '[]'::jsonb; end if;
  v_private=auth.uid() is not null and (auth.uid()=t.author_id or public.can_manage_tree_adoption(t.city_id));
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'tree_id',c.tree_id,'action',c.action,'performed_on',c.performed_on,
    'notes',c.notes,'photo_path',c.photo_path,'is_public',c.is_public,'is_hidden',c.is_hidden,
    'hidden_reason',case when v_private then c.hidden_reason end,'created_at',c.created_at,'updated_at',c.updated_at) order by c.performed_on desc,c.created_at desc,c.id)
    from (select * from public.community_tree_care where tree_id=p_tree and (v_private or (is_public and not is_hidden))
      order by performed_on desc,created_at desc,id limit least(greatest(coalesce(p_limit,30),1),100) offset greatest(coalesce(p_offset,0),0)) c),'[]'::jsonb);
end $$;
revoke all on function public.list_community_tree_care(uuid,integer,integer) from public;
grant execute on function public.list_community_tree_care(uuid,integer,integer) to anon,authenticated;

create or replace function public.set_community_care_privacy(p_id uuid,p_public boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or p_public is null then raise exception 'Revise sua conta e a privacidade.' using errcode='42501'; end if;
  update public.community_tree_care set is_public=p_public,updated_at=clock_timestamp() where id=p_id and author_id=auth.uid();
  if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
end $$;
revoke all on function public.set_community_care_privacy(uuid,boolean) from public,anon;
grant execute on function public.set_community_care_privacy(uuid,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
