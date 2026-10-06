-- Demandas são trabalho interno da prefeitura. Broncas continuam registros públicos.
begin;

create table public.demandas_municipais (
  id uuid primary key default gen_random_uuid(),
  prefeitura_id uuid not null references public.prefeituras(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  protocolo text not null unique default ('DEM-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  titulo text not null check (length(btrim(titulo)) between 3 and 180),
  descricao text,
  bairro text,
  category_id text references public.categories(id),
  prioridade text not null default 'normal' check (prioridade in ('baixa','normal','alta','urgente')),
  status text not null default 'aberta' check (status in ('aberta','em_andamento','concluida','cancelada')),
  canal_id uuid references public.orgao_canais(id) on delete set null,
  prazo_em timestamptz,
  concluida_em timestamptz,
  criado_por uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index demandas_municipais_bronca_unica on public.demandas_municipais(report_id) where report_id is not null;
create index demandas_municipais_fila on public.demandas_municipais(prefeitura_id, status, created_at desc);

create or replace function public.validar_demanda_municipal()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where id = new.prefeitura_id and status = 'ativa';
  if v_city is null or not public.pode_acessar_prefeitura(auth.uid(), v_city) then
    raise exception 'Sem acesso a esta prefeitura';
  end if;
  if not public.pode_administrar_prefeitura(auth.uid(), v_city) then
    if new.canal_id is null or not exists (
      select 1 from public.orgao_membros m join public.orgao_canais c on c.id = m.canal_id
      where m.user_id = auth.uid() and m.ativo and m.papel in ('gestor','operador')
        and c.city_id = v_city and m.canal_id = new.canal_id
    ) then raise exception 'Selecione sua secretaria para gerir a demanda'; end if;
    if tg_op = 'UPDATE' then
      if old.canal_id is distinct from new.canal_id then
        raise exception 'Somente o administrador pode encaminhar a demanda a outra secretaria';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.prefeitura_id <> old.prefeitura_id then raise exception 'Prefeitura não pode ser alterada'; end if;
    if new.report_id is distinct from old.report_id then raise exception 'O vínculo com a bronca não pode ser alterado'; end if;
    if new.protocolo <> old.protocolo then raise exception 'O protocolo não pode ser alterado'; end if;
  end if;
  if new.report_id is not null and not exists (
    select 1 from public.reports r where r.id = new.report_id and r.city_id = v_city
      and coalesce(r.moderation_status, 'approved') = 'approved' and not coalesce(r.is_petition, false)
  ) then raise exception 'Bronca inválida para esta prefeitura'; end if;
  if new.canal_id is not null and not exists (
    select 1 from public.orgao_canais c where c.id = new.canal_id and c.city_id = v_city and c.ativo and not c.canal_triagem
  ) then raise exception 'Secretaria inválida para esta prefeitura'; end if;
  new.titulo := btrim(new.titulo);
  new.bairro := nullif(btrim(coalesce(new.bairro, '')), '');
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then new.criado_por := auth.uid(); end if;
  if new.status = 'concluida' then
    if tg_op = 'INSERT' then new.concluida_em := now();
    elsif old.status <> 'concluida' then new.concluida_em := now();
    end if;
  end if;
  if new.status <> 'concluida' then new.concluida_em := null; end if;
  return new;
end $$;
create trigger validar_demanda_municipal before insert or update on public.demandas_municipais
for each row execute function public.validar_demanda_municipal();

-- Uma conclusão vinculada aparece na linha do tempo pública e segue para
-- confirmação do cidadão; o fechamento interno não verifica a bronca sozinho.
create or replace function public.publicar_andamento_demanda()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_orgao text;
begin
  if new.report_id is null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status = old.status then return new; end if;
  end if;
  if new.status not in ('em_andamento','concluida') then return new; end if;
  select coalesce(c.nome, p.nome) into v_orgao from public.prefeituras p
    left join public.orgao_canais c on c.id = new.canal_id where p.id = new.prefeitura_id;
  insert into public.report_official_steps(report_id,etapa,orgao,protocolo,observacao,registrado_por,registrado_por_papel)
  values (new.report_id, case when new.status = 'concluida' then 'executada' else 'recebida' end,
    v_orgao,new.protocolo,'Atendimento municipal vinculado à demanda ' || new.protocolo,
    auth.uid(),'orgao');
  if new.status = 'concluida' then
    update public.reports set status = 'pending_resolution'
    where id = new.report_id and status in ('pending','in-progress');
  elsif new.status = 'em_andamento' then
    update public.reports set status = 'in-progress'
    where id = new.report_id and status = 'pending';
  end if;
  return new;
end $$;
create trigger publicar_andamento_demanda after insert or update of status on public.demandas_municipais
for each row execute function public.publicar_andamento_demanda();
alter table public.demandas_municipais enable row level security;
create policy demandas_municipais_select on public.demandas_municipais for select to authenticated using (
  exists (select 1 from public.prefeituras p where p.id = prefeitura_id and public.pode_acessar_prefeitura(auth.uid(), p.city_id))
);
create policy demandas_municipais_insert on public.demandas_municipais for insert to authenticated with check (
  exists (select 1 from public.prefeituras p where p.id = prefeitura_id and public.pode_acessar_prefeitura(auth.uid(), p.city_id))
);
create policy demandas_municipais_update on public.demandas_municipais for update to authenticated using (
  exists (select 1 from public.prefeituras p where p.id = prefeitura_id and public.pode_acessar_prefeitura(auth.uid(), p.city_id))
) with check (
  exists (select 1 from public.prefeituras p where p.id = prefeitura_id and public.pode_acessar_prefeitura(auth.uid(), p.city_id))
);
revoke all on public.demandas_municipais from anon;
grant select, insert, update on public.demandas_municipais to authenticated;

create or replace function public.resumo_demandas_municipais(p_prefeitura uuid)
returns table(total bigint, abertas bigint, em_andamento bigint, concluidas bigint, atrasadas bigint, vinculadas bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  select count(*)::bigint,
    count(*) filter (where status = 'aberta')::bigint,
    count(*) filter (where status = 'em_andamento')::bigint,
    count(*) filter (where status = 'concluida')::bigint,
    count(*) filter (where status in ('aberta','em_andamento') and prazo_em < now())::bigint,
    count(*) filter (where report_id is not null)::bigint
  from public.demandas_municipais where prefeitura_id = p_prefeitura
$$;
grant execute on function public.resumo_demandas_municipais(uuid) to authenticated;

-- Os postes importados não tinham cidade. O dataset FLORESTA é identificado
-- explicitamente; os demais podem ser vinculados pela prefeitura depois.
alter table public.poles add column if not exists city_id bigint references public.cities(id);
alter table public.poles add column if not exists lamp_type text;
alter table public.poles add column if not exists lamp_power_w numeric(8,2);
alter table public.poles add column if not exists lighting_status text not null default 'nao_informado';
alter table public.poles add constraint poles_lamp_power_positive check (lamp_power_w is null or lamp_power_w > 0);
alter table public.poles add constraint poles_lighting_status_valid check (lighting_status in ('nao_informado','aceso','apagado','manutencao','removido'));
update public.poles p set city_id = r.city_id from public.reports r
where r.pole_id = p.id and p.city_id is null and r.city_id is not null;
update public.poles p set city_id = c.id from public.pole_datasets d, public.cities c
join public.states s on s.id = c.state_id
where p.dataset_id = d.id and p.city_id is null and d.name ~* '^FLORESTA([[:space:]]|$)'
  and unaccent(lower(c.name)) = 'floresta' and s.uf = 'PE';
create index if not exists poles_city_id_idx on public.poles(city_id);

-- O diretor (gestor do canal de iluminação) precisa enxergar a categoria do
-- próprio canal para que o painel habilite a edição de postes.
create policy orgao_categorias_gestor_iluminacao_select on public.orgao_categorias
for select to authenticated using (
  category_id = 'iluminacao' and exists (
    select 1 from public.orgao_membros m
    join public.orgao_canais c on c.id = m.canal_id
    where m.canal_id = orgao_categorias.canal_id and m.user_id = auth.uid()
      and m.ativo and m.papel = 'gestor' and public.pode_acessar_prefeitura(auth.uid(), c.city_id)
  )
);

-- Postes removidos do inventário municipal deixam de ser sugeridos em novas broncas.
create or replace function public.nearest_poles(
  lat double precision, lng double precision, radius_m integer default 60, max_results integer default 5
) returns table (
  pole_id bigint, identifier text, plate text, address text,
  latitude double precision, longitude double precision, is_broken boolean, distance_m integer
) language sql stable as $$
  with params as (
    select extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography as point,
      greatest(1,least(radius_m,5000))::integer as radius,
      greatest(1,least(max_results,25))::integer as maximum
  )
  select p.id,p.identifier,p.plate,p.address,p.latitude,p.longitude,p.is_broken,
    round(extensions.st_distance(p.geom,params.point))::integer
  from public.poles p cross join params
  where extensions.st_dwithin(p.geom,params.point,params.radius)
    and coalesce(p.validation_status,'approved') = 'approved'
    and p.lighting_status <> 'removido'
  order by extensions.st_distance(p.geom,params.point)
  limit (select maximum from params)
$$;

create table public.pole_lighting_changes (
  id bigint generated always as identity primary key,
  pole_id bigint not null references public.poles(id),
  city_id bigint not null references public.cities(id),
  pole_number text not null,
  address text,
  old_power_w numeric(8,2),
  new_power_w numeric(8,2),
  old_lamp_type text,
  new_lamp_type text,
  old_status text,
  new_status text,
  action text not null check (action in ('created','updated','removed')),
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);
create index pole_lighting_changes_city_date on public.pole_lighting_changes(city_id, changed_at desc);
alter table public.pole_lighting_changes enable row level security;
create policy pole_lighting_changes_select on public.pole_lighting_changes for select to authenticated using (
  public.pode_acessar_prefeitura(auth.uid(), city_id)
);
grant select on public.pole_lighting_changes to authenticated;

create or replace function public.gerir_iluminacao_municipal(
  p_city_id bigint, p_action text, p_pole_id bigint default null, p_number text default null,
  p_address text default null, p_lat double precision default null, p_lng double precision default null,
  p_lamp_type text default null, p_power_w numeric default null, p_status text default 'nao_informado'
) returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pole public.poles%rowtype; v_id bigint; v_dataset bigint;
begin
  if not public.pode_acessar_prefeitura(auth.uid(), p_city_id) or not (
    public.pode_administrar_prefeitura(auth.uid(), p_city_id) or exists (
      select 1 from public.orgao_membros m
      join public.orgao_canais c on c.id = m.canal_id
      join public.orgao_categorias oc on oc.canal_id = c.id and oc.category_id = 'iluminacao'
      where m.user_id = auth.uid() and m.ativo and m.papel = 'gestor' and c.city_id = p_city_id
    )
  ) then raise exception 'Somente o gestor de iluminação ou administrador municipal pode alterar postes'; end if;
  if p_action not in ('created','updated','removed') then raise exception 'Ação inválida'; end if;
  if p_status not in ('nao_informado','aceso','apagado','manutencao','removido') then raise exception 'Status inválido'; end if;
  if p_power_w is not null and (p_power_w <= 0 or p_power_w > 999999) then raise exception 'Potência inválida'; end if;
  if p_action = 'created' then
    if nullif(btrim(coalesce(p_number,'')), '') is null or p_lat is null or p_lng is null
       or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'Número e coordenadas válidas são obrigatórios'; end if;
    select id into v_dataset from public.pole_datasets
      where source = 'municipal' and name = 'Prefeitura ' || p_city_id::text limit 1;
    if v_dataset is null then
      insert into public.pole_datasets(name,source,created_by)
      values ('Prefeitura ' || p_city_id::text,'municipal',auth.uid()) returning id into v_dataset;
    end if;
    insert into public.poles(dataset_id,city_id,identifier,address,geom,latitude,longitude,
      lamp_type,lamp_power_w,lighting_status,validation_status,created_by)
    values (v_dataset,p_city_id,btrim(p_number),nullif(btrim(coalesce(p_address,'')),''),
      extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography,
      p_lat,p_lng,nullif(btrim(coalesce(p_lamp_type,'')),''),p_power_w,p_status,'approved',auth.uid())
    returning id into v_id;
  else
    select * into v_pole from public.poles where id = p_pole_id and city_id = p_city_id for update;
    if v_pole.id is null then raise exception 'Poste não encontrado nesta cidade'; end if;
    v_id := v_pole.id;
    if p_action = 'removed' then
      update public.poles set lighting_status = 'removido' where id = v_id;
    else
      update public.poles set identifier = coalesce(nullif(btrim(coalesce(p_number,'')),''),identifier),
        address = nullif(btrim(coalesce(p_address,'')),''),
        lamp_type = nullif(btrim(coalesce(p_lamp_type,'')),''), lamp_power_w = p_power_w,
        lighting_status = p_status where id = v_id;
    end if;
  end if;
  insert into public.pole_lighting_changes(pole_id,city_id,pole_number,address,old_power_w,new_power_w,
    old_lamp_type,new_lamp_type,old_status,new_status,action,changed_by)
  select p.id,p_city_id,coalesce(p.identifier,p.plate,p.id::text),p.address,
    v_pole.lamp_power_w,p.lamp_power_w,v_pole.lamp_type,p.lamp_type,
    v_pole.lighting_status,p.lighting_status,p_action,auth.uid()
  from public.poles p where p.id = v_id;
  return v_id;
end $$;
revoke all on function public.gerir_iluminacao_municipal(bigint,text,bigint,text,text,double precision,double precision,text,numeric,text) from public, anon;
grant execute on function public.gerir_iluminacao_municipal(bigint,text,bigint,text,text,double precision,double precision,text,numeric,text) to authenticated;

notify pgrst, 'reload schema';
commit;
