begin;

-- Cadastros da comunidade têm aprovação e privacidade próprias. Não concedem
-- escrita no inventário técnico nem nos serviços executados pela prefeitura.
create table public.community_trees (
  id uuid primary key,
  author_id uuid not null references public.profiles(id),
  city_id bigint not null references public.cities(id),
  name text not null check(length(trim(name)) between 3 and 100),
  species_id uuid references public.city_tree_species(id),
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  address text check(length(address)<=300),
  planted_on date check(planted_on<=current_date),
  cover_photo text not null,
  public_profile boolean not null default true,
  location_visibility text not null default 'city' check(location_visibility in ('city','exact')),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  review_note text check(length(review_note)<=1000),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_trees_author on public.community_trees(author_id,created_at desc);
create index community_trees_review on public.community_trees(city_id,status,created_at);
create index community_trees_public on public.community_trees(city_id,created_at desc) where status='approved' and public_profile;

create table public.community_tree_care (
  id uuid primary key,
  tree_id uuid not null references public.community_trees(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  action text not null check(action in ('watering','growth','observation')),
  performed_on date not null check(performed_on<=current_date),
  notes text check(length(notes)<=1500),
  photo_path text,
  is_public boolean not null default true,
  is_hidden boolean not null default false,
  hidden_reason text check(length(hidden_reason)<=1000),
  created_at timestamptz not null default now()
);
create index community_care_timeline on public.community_tree_care(tree_id,performed_on desc,created_at desc);

create table public.community_tree_care_reports (
  id uuid primary key default gen_random_uuid(),
  care_id uuid not null references public.community_tree_care(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id),
  reason text not null check(length(trim(reason)) between 5 and 1000),
  status text not null default 'pending' check(status in ('pending','resolved')),
  resolution text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(care_id,reporter_id)
);

alter table public.community_trees enable row level security;
alter table public.community_tree_care enable row level security;
alter table public.community_tree_care_reports enable row level security;
revoke all on public.community_trees,public.community_tree_care,public.community_tree_care_reports from public,anon,authenticated;
grant select on public.community_trees,public.community_tree_care,public.community_tree_care_reports to authenticated;
create policy community_tree_private_read on public.community_trees for select to authenticated
  using(author_id=auth.uid() or public.can_manage_tree_adoption(city_id));
create policy community_care_private_read on public.community_tree_care for select to authenticated
  using(exists(select 1 from public.community_trees t where t.id=tree_id));
create policy community_reports_private_read on public.community_tree_care_reports for select to authenticated
  using(reporter_id=auth.uid() or exists(select 1 from public.community_tree_care c join public.community_trees t on t.id=c.tree_id where c.id=care_id and public.can_manage_tree_adoption(t.city_id)));

-- As fotos pendentes nunca entram em um bucket público. A leitura pública só
-- é liberada para fotos de perfis aprovados e cuidados visíveis nesse perfil.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('community-tree-photos','community-tree-photos',false,5242880,array['image/jpeg','image/png','image/webp']);

create function public.can_read_community_photo(p_path text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and split_part(p_path,'/',1)=auth.uid()::text
    or exists(select 1 from public.community_trees t where t.id::text=split_part(p_path,'/',2) and (
      (auth.uid() is not null and public.can_manage_tree_adoption(t.city_id))
      or (t.status='approved' and t.public_profile and (t.cover_photo=p_path or exists(
        select 1 from public.community_tree_care c where c.tree_id=t.id and c.photo_path=p_path and c.is_public and not c.is_hidden)))))
$$;
revoke all on function public.can_read_community_photo(text) from public;
grant execute on function public.can_read_community_photo(text) to anon,authenticated;
create policy community_photos_read on storage.objects for select to anon,authenticated
  using(bucket_id='community-tree-photos' and public.can_read_community_photo(name));
create policy community_photos_upload on storage.objects for insert to authenticated
  with check(bucket_id='community-tree-photos' and split_part(name,'/',1)=auth.uid()::text
    and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$');
create policy community_photos_cleanup on storage.objects for delete to authenticated
  using(bucket_id='community-tree-photos' and split_part(name,'/',1)=auth.uid()::text
    and not exists(select 1 from public.community_trees t where t.cover_photo=storage.objects.name)
    and not exists(select 1 from public.community_tree_care c where c.photo_path=storage.objects.name));

create function public.valid_community_photo(p_path text,p_tree uuid,p_author uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select p_path like p_author::text||'/'||p_tree::text||'/%' and exists(
    select 1 from storage.objects where bucket_id='community-tree-photos' and name=p_path)
$$;
revoke all on function public.valid_community_photo(text,uuid,uuid) from public,anon,authenticated;

create function public.submit_community_tree(p_tree jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.community_trees; v_id uuid; v_city bigint; v_species uuid; v_date date;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para cadastrar uma árvore.' using errcode='42501'; end if;
  v_id=(p_tree->>'id')::uuid; v_city=(p_tree->>'city_id')::bigint;
  perform pg_advisory_xact_lock(hashtext('community-tree'),hashtext(v_id::text));
  select * into t from public.community_trees where id=v_id for update;
  if found then
    if t.author_id<>auth.uid() then raise exception 'Cadastro indisponível.' using errcode='42501'; end if;
    if t.status<>'rejected' then return t.id; end if;
    if t.city_id<>v_city then raise exception 'A cidade do cadastro não pode ser alterada.'; end if;
  end if;
  if v_id is null or not exists(select 1 from public.cities where id=v_city) then raise exception 'Selecione uma cidade válida.'; end if;
  if coalesce(length(trim(p_tree->>'name')),0) not between 3 and 100 then raise exception 'Informe um nome de 3 a 100 caracteres.'; end if;
  if jsonb_typeof(p_tree->'latitude') is distinct from 'number' or jsonb_typeof(p_tree->'longitude') is distinct from 'number'
    or (p_tree->>'latitude')::numeric not between -90 and 90 or (p_tree->>'longitude')::numeric not between -180 and 180 then raise exception 'Marque a localização da árvore.'; end if;
  v_species=nullif(p_tree->>'species_id','')::uuid;
  if v_species is not null and not exists(select 1 from public.city_tree_species where id=v_species and city_id=v_city) then raise exception 'Selecione uma espécie desta cidade.'; end if;
  v_date=nullif(p_tree->>'planted_on','')::date;
  if v_date>current_date then raise exception 'A data do plantio não pode estar no futuro.'; end if;
  if coalesce(p_tree->>'location_visibility','city') not in ('city','exact') then raise exception 'Revise a privacidade da localização.'; end if;
  if not coalesce(public.valid_community_photo(p_tree->>'cover_photo',v_id,auth.uid()),false) then raise exception 'Envie uma foto da árvore para análise.'; end if;
  insert into public.community_trees(id,author_id,city_id,name,species_id,latitude,longitude,address,planted_on,cover_photo,public_profile,location_visibility)
    values(v_id,auth.uid(),v_city,trim(p_tree->>'name'),v_species,(p_tree->>'latitude')::double precision,(p_tree->>'longitude')::double precision,
      nullif(trim(p_tree->>'address'),''),v_date,p_tree->>'cover_photo',coalesce((p_tree->>'public_profile')::boolean,true),coalesce(p_tree->>'location_visibility','city'))
    on conflict(id) do update set name=excluded.name,species_id=excluded.species_id,latitude=excluded.latitude,longitude=excluded.longitude,
      address=excluded.address,planted_on=excluded.planted_on,cover_photo=excluded.cover_photo,public_profile=excluded.public_profile,
      location_visibility=excluded.location_visibility,status='pending',review_note=null,reviewed_by=null,reviewed_at=null,updated_at=now();
  return v_id;
end $$;
revoke all on function public.submit_community_tree(jsonb) from public,anon;
grant execute on function public.submit_community_tree(jsonb) to authenticated;

create function public.review_community_tree(p_id uuid,p_expected_status text,p_approve boolean,p_note text default '') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.community_trees;
begin
  select * into t from public.community_trees where id=p_id for update;
  if not found or auth.uid() is null or not public.can_manage_tree_adoption(t.city_id) then raise exception 'Sem permissão para revisar este cadastro.' using errcode='42501'; end if;
  if t.status is distinct from p_expected_status then raise exception 'O cadastro foi revisado por outra pessoa. Atualize a lista.'; end if;
  if p_approve is null or length(coalesce(p_note,''))>1000 or (not p_approve and length(trim(coalesce(p_note,'')))<5) then raise exception 'Explique o motivo da revisão (5 a 1.000 caracteres).'; end if;
  if t.status=(case when p_approve then 'approved' else 'rejected' end) then return; end if;
  update public.community_trees set status=case when p_approve then 'approved' else 'rejected' end,
    review_note=nullif(trim(p_note),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=t.id;
  if t.author_id<>auth.uid() then
    insert into public.notifications(user_id,type,title,message,link,is_read,created_at)
      values(t.author_id,'community_tree_update',case when p_approve then 'Cadastro de árvore aprovado' else 'Revise o cadastro da sua árvore' end,
        case when p_approve then 'Sua árvore foi aprovada. Acompanhe os cuidados e compartilhe a evolução.' else 'A equipe deixou uma orientação para corrigir o cadastro da árvore.' end,
        '/arvores-da-comunidade/'||t.id,false,now());
  end if;
end $$;
revoke all on function public.review_community_tree(uuid,text,boolean,text) from public,anon;
grant execute on function public.review_community_tree(uuid,text,boolean,text) to authenticated;

create function public.record_community_tree_care(p_care jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.community_trees; c public.community_tree_care; v_id uuid; v_photo text;
begin
  select * into t from public.community_trees where id=(p_care->>'tree_id')::uuid for share;
  if not found or auth.uid() is null or t.author_id<>auth.uid() then raise exception 'Você só pode registrar cuidados nas árvores que cadastrou.' using errcode='42501'; end if;
  v_id=(p_care->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtext('community-care'),hashtext(v_id::text));
  select * into c from public.community_tree_care where id=v_id;
  if found then
    if c.author_id<>auth.uid() or c.tree_id<>t.id then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    return c.id;
  end if;
  v_photo=nullif(p_care->>'photo_path','');
  if v_photo is not null and not coalesce(public.valid_community_photo(v_photo,t.id,auth.uid()),false) then raise exception 'Envie uma foto válida para esta árvore.'; end if;
  insert into public.community_tree_care(id,tree_id,author_id,action,performed_on,notes,photo_path,is_public)
    values(v_id,t.id,auth.uid(),p_care->>'action',(p_care->>'performed_on')::date,nullif(trim(p_care->>'notes'),''),v_photo,coalesce((p_care->>'is_public')::boolean,true));
  return v_id;
end $$;
revoke all on function public.record_community_tree_care(jsonb) from public,anon;
grant execute on function public.record_community_tree_care(jsonb) to authenticated;

create function public.set_community_tree_privacy(p_id uuid,p_public boolean,p_location text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  update public.community_trees set public_profile=p_public,location_visibility=p_location,updated_at=now() where id=p_id and author_id=auth.uid();
  if not found then raise exception 'Cadastro indisponível.' using errcode='42501'; end if;
end $$;
revoke all on function public.set_community_tree_privacy(uuid,boolean,text) from public,anon;
grant execute on function public.set_community_tree_privacy(uuid,boolean,text) to authenticated;

-- Uma projeção pública explícita impede expor endereço, coordenadas privadas,
-- identificação do autor ou observações da revisão em consultas anônimas.
create function public.get_community_tree(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t public.community_trees; v_private boolean; v_review boolean; result jsonb;
begin
  select * into t from public.community_trees where id=p_id;
  if not found then return null; end if;
  v_review=auth.uid() is not null and public.can_manage_tree_adoption(t.city_id);
  v_private=auth.uid() is not null and (auth.uid()=t.author_id or v_review);
  if not v_private and (t.status<>'approved' or not t.public_profile) then return null; end if;
  result=jsonb_build_object('id',t.id,'city_id',t.city_id,'city_name',(select name from public.cities where id=t.city_id),
    'name',t.name,'species_id',t.species_id,'species_name',(select common_name from public.city_tree_species where id=t.species_id),
    'planted_on',t.planted_on,'cover_photo',t.cover_photo,'public_profile',t.public_profile,'location_visibility',t.location_visibility,
    'status',t.status,'created_at',t.created_at,'updated_at',t.updated_at,'is_owner',coalesce(auth.uid()=t.author_id,false),'can_review',v_review,
    'latitude',case when v_private or t.location_visibility='exact' then t.latitude end,
    'longitude',case when v_private or t.location_visibility='exact' then t.longitude end,
    'address',case when v_private or t.location_visibility='exact' then t.address end,
    'review_note',case when v_private then t.review_note end,
    'care_count',(select count(*) from public.community_tree_care c where c.tree_id=t.id and (v_private or (c.is_public and not c.is_hidden))),
    'public_care_count',(select count(*) from public.community_tree_care c where c.tree_id=t.id and c.is_public and not c.is_hidden),
    'latest_public_care',(select jsonb_build_object('photo_path',c.photo_path,'performed_on',c.performed_on,'created_at',c.created_at,'is_public',true,'is_hidden',false)
      from public.community_tree_care c where c.tree_id=t.id and c.is_public and not c.is_hidden and c.photo_path is not null
      order by c.performed_on desc,c.created_at desc,c.id limit 1));
  return result;
end $$;
revoke all on function public.get_community_tree(uuid) from public;
grant execute on function public.get_community_tree(uuid) to anon,authenticated;

create function public.list_community_trees(p_city bigint default null,p_mode text default 'public',p_status text default null,p_limit integer default 24,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_mode not in ('public','mine','review') or p_mode is null then raise exception 'Consulta inválida.'; end if;
  if p_mode='mine' and auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  if p_mode='review' and (auth.uid() is null or p_city is null or not public.can_manage_tree_adoption(p_city)) then raise exception 'Sem permissão nesta cidade.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(public.get_community_tree(q.id) order by q.created_at desc,q.id) from (
    select t.id,t.created_at from public.community_trees t where (p_city is null or t.city_id=p_city)
      and case p_mode when 'public' then t.status='approved' and t.public_profile when 'mine' then t.author_id=auth.uid() else true end
      and (p_status is null or t.status=p_status)
    order by t.created_at desc,t.id limit least(greatest(coalesce(p_limit,24),1),100) offset greatest(coalesce(p_offset,0),0)
  ) q),'[]'::jsonb);
end $$;
revoke all on function public.list_community_trees(bigint,text,text,integer,integer) from public;
grant execute on function public.list_community_trees(bigint,text,text,integer,integer) to anon,authenticated;

create function public.list_community_tree_care(p_tree uuid,p_limit integer default 30,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t public.community_trees; v_private boolean;
begin
  select * into t from public.community_trees where id=p_tree;
  if not found or public.get_community_tree(p_tree) is null then return '[]'::jsonb; end if;
  v_private=auth.uid() is not null and (auth.uid()=t.author_id or public.can_manage_tree_adoption(t.city_id));
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'tree_id',c.tree_id,'action',c.action,'performed_on',c.performed_on,
    'notes',c.notes,'photo_path',c.photo_path,'is_public',c.is_public,'is_hidden',c.is_hidden,
    'hidden_reason',case when v_private then c.hidden_reason end,'created_at',c.created_at) order by c.performed_on desc,c.created_at desc,c.id)
    from (select * from public.community_tree_care where tree_id=p_tree and (v_private or (is_public and not is_hidden))
      order by performed_on desc,created_at desc,id limit least(greatest(coalesce(p_limit,30),1),100) offset greatest(coalesce(p_offset,0),0)) c),'[]'::jsonb);
end $$;
revoke all on function public.list_community_tree_care(uuid,integer,integer) from public;
grant execute on function public.list_community_tree_care(uuid,integer,integer) to anon,authenticated;

create function public.report_community_tree_care(p_care uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.community_tree_care; t public.community_trees;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para denunciar.' using errcode='42501'; end if;
  select * into c from public.community_tree_care where id=p_care;
  select * into t from public.community_trees where id=c.tree_id;
  if t.id is null or t.status<>'approved' or not t.public_profile or not c.is_public or c.is_hidden then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if c.author_id=auth.uid() then raise exception 'Use as opções de privacidade para ocultar seus próprios registros.'; end if;
  insert into public.community_tree_care_reports(care_id,reporter_id,reason) values(c.id,auth.uid(),trim(p_reason)) on conflict(care_id,reporter_id) do nothing;
end $$;
revoke all on function public.report_community_tree_care(uuid,text) from public,anon;
grant execute on function public.report_community_tree_care(uuid,text) to authenticated;

create function public.review_community_tree_care_report(p_report uuid,p_hide boolean,p_resolution text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.community_tree_care_reports; c public.community_tree_care; v_city bigint;
begin
  select * into r from public.community_tree_care_reports where id=p_report for update;
  select * into c from public.community_tree_care where id=r.care_id for update;
  select city_id into v_city from public.community_trees where id=c.tree_id;
  if v_city is null or auth.uid() is null or not public.can_manage_tree_adoption(v_city) then raise exception 'Sem permissão para revisar esta denúncia.' using errcode='42501'; end if;
  if r.status<>'pending' then raise exception 'Esta denúncia já foi revisada.'; end if;
  if p_hide is null or coalesce(length(trim(p_resolution)),0) not between 5 and 1000 then raise exception 'Registre uma justificativa de 5 a 1.000 caracteres.'; end if;
  if p_hide then update public.community_tree_care set is_hidden=true,hidden_reason=trim(p_resolution) where id=c.id; end if;
  update public.community_tree_care_reports set status='resolved',resolution=trim(p_resolution),reviewed_by=auth.uid(),reviewed_at=now() where care_id=c.id and status='pending';
end $$;
revoke all on function public.review_community_tree_care_report(uuid,boolean,text) from public,anon;
grant execute on function public.review_community_tree_care_report(uuid,boolean,text) to authenticated;

create function public.set_community_care_privacy(p_id uuid,p_public boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  update public.community_tree_care set is_public=p_public where id=p_id and author_id=auth.uid();
  if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
end $$;
revoke all on function public.set_community_care_privacy(uuid,boolean) from public,anon;
grant execute on function public.set_community_care_privacy(uuid,boolean) to authenticated;

create function public.list_community_care_reports(p_city bigint,p_limit integer default 24,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or p_city is null or not public.can_manage_tree_adoption(p_city) then raise exception 'Sem permissão nesta cidade.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(q.item order by q.created_at,q.id) from (
    select r.id,r.created_at,jsonb_build_object('id',r.id,'care_id',c.id,'tree_id',t.id,'tree_name',t.name,'reason',r.reason,
      'created_at',r.created_at,'notes',c.notes,'photo_path',c.photo_path,'action',c.action,'performed_on',c.performed_on) as item
    from public.community_tree_care_reports r join public.community_tree_care c on c.id=r.care_id join public.community_trees t on t.id=c.tree_id
    where r.status='pending' and t.city_id=p_city order by r.created_at,r.id limit least(greatest(coalesce(p_limit,24),1),100) offset greatest(coalesce(p_offset,0),0)
  ) q),'[]'::jsonb);
end $$;
revoke all on function public.list_community_care_reports(bigint,integer,integer) from public,anon;
grant execute on function public.list_community_care_reports(bigint,integer,integer) to authenticated;

-- Mantém os nomes já reservados e inclui a nova rota pública.
create or replace function public.is_username_reserved(p_username text)
returns boolean language sql immutable set search_path=public as $$
  select lower(trim(p_username)) in (
    'admin','administrator','suporte','support','trombone','trombonecidadao',
    'prefeitura','vereador','vereadores','mandato','oficial','governo','camara',
    'feed','mapa','bronca','broncas','obras','obras-publicas','estatisticas',
    'sobre','contato','noticia','noticias','servicos','guiadacidade','guia-da-cidade','perfil','login','cadastro',
    'entrar','sair','ajuda','termos','privacidade','patrulha','missoes',
    'agora','radar','pavimentacao','mapa-pavimentacao','arborizacao','mapa-arborizacao','adote-uma-arvore','arvores-da-comunidade','abaixo-assinado',
    'abaixo-assinados','peticoes','favoritos','salvos-outros','obras-favoritas',
    'settings','configuracoes','explorar','seguindo','api','auth','share','u',
    'root','moderador','moderacao','sistema','ouvidoria','denuncia','relatorio',
    'buscar','app','convite','imoveis-alugados','meta','embaixador',
    'painel-usuario','alterar-senha','excluir-conta','minhas-peticoes'
  )
$$;
notify pgrst,'reload schema';
commit;
