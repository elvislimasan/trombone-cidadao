begin;

-- Operação-pipa é um inventário privado por secretaria. Pipeiros não recebem
-- acesso às tabelas de responsáveis: o workspace de campo projeta só o destino.
alter table public.orgao_canais drop constraint department_modules_valid;
alter table public.orgao_canais add constraint department_modules_valid check (
  municipal_modules <@ array['urban_planning','arborization','lighting','water_supply']::text[]
  and array_position(municipal_modules,null) is null);
do $migration$
declare definition text;
begin
  definition=pg_get_functiondef('public.salvar_secretaria_municipal(uuid,bigint,jsonb,text[],text[],text[],integer)'::regprocedure);
  if position('''urban_planning'',''arborization'',''lighting''' in definition)=0 then raise exception 'Contrato inesperado de secretaria'; end if;
  execute replace(definition,'''urban_planning'',''arborization'',''lighting''','''urban_planning'',''arborization'',''lighting'',''water_supply''');
  definition=pg_get_functiondef('public.salvar_secretaria_execucao(uuid,bigint,jsonb,text[],text[],integer)'::regprocedure);
  execute replace(definition,'''urban_planning'',''arborization''','''urban_planning'',''arborization'',''water_supply''');
end $migration$;

-- Atendimento da água não depende de categorias de broncas. Permite cargos
-- de gestor/atendente/leitura em secretarias dedicadas à Operação-pipa.
do $migration$
declare signature text; definition text; old_clause text; channel_arg text;
begin
  foreach signature in array array[
    'public.convidar_funcionario_secretaria(uuid,uuid,text,text[])',
    'public.municipal_assign_existing_public_official(uuid,uuid,uuid,text[])',
    'public.validate_municipal_provisioning(text,bigint,uuid,uuid,text[])'
  ] loop
    definition=pg_get_functiondef(signature::regprocedure);
    channel_arg=case when signature like '%validate_municipal%' then 'p_channel' else 'p_canal' end;
    old_clause=case when signature like '%validate_municipal%' then 'and p_roles is distinct from array[''inventario'']::text[] then' else 'and p_cargos is distinct from array[''inventario'']::text[] then' end;
    if position(old_clause in definition)=0 then raise exception 'Contrato inesperado: %',signature; end if;
    execute replace(definition,old_clause,replace(old_clause,' then',' and not exists(select 1 from public.orgao_canais where id='||channel_arg||' and ''water_supply''=any(municipal_modules)) then'));
  end loop;
end $migration$;

create function public.pipa_valid_cpf(p_document text) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare n integer; i integer; s integer;
begin
  if p_document is null or p_document !~ '^[0-9]{11}$' or p_document ~ '^([0-9])\1{10}$' then return false; end if;
  for n in 9..10 loop
    s=0;
    for i in 1..n loop s=s+substring(p_document,i,1)::integer*(n+2-i); end loop;
    if ((s*10)%11)%10<>substring(p_document,n+1,1)::integer then return false; end if;
  end loop;
  return true;
end $$;

create function public.pipa_can(p_channel uuid,p_action text default 'read') returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and exists(
    select 1 from public.orgao_canais c join public.prefeituras p on p.city_id=c.city_id and p.status='ativa'
    join public.prefeitura_membros pm on pm.prefeitura_id=p.id and pm.user_id=auth.uid() and pm.ativo
    left join public.orgao_membros m on m.canal_id=c.id and m.user_id=auth.uid() and m.ativo
    left join public.orgao_membro_acessos a on a.membro_id=m.id
    where c.id=p_channel and c.ativo and not c.canal_triagem and 'water_supply'=any(c.municipal_modules)
    and (pm.papel='administrador' or case p_action
      when 'read' then a.cargos && array['gestor','atendente','inventario','leitura']
      when 'request' then a.cargos && array['gestor','atendente','inventario']
      when 'manage' then a.cargos && array['gestor','inventario'] else false end))
$$;

create table public.pipa_tanks (
  id uuid primary key default gen_random_uuid(), channel_id uuid not null references public.orgao_canais(id),
  name text not null check(length(btrim(name)) between 2 and 160),
  locality text not null check(length(btrim(locality)) between 2 and 160), address text not null default '',
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  capacity_liters integer not null check(capacity_liters>0),
  provider text not null check(provider in ('prefeitura','exercito')),
  responsible_name text not null check(length(btrim(responsible_name)) between 3 and 160),
  responsible_document text not null check(public.pipa_valid_cpf(responsible_document)),
  responsible_phone text not null check(length(regexp_replace(responsible_phone,'\D','','g')) between 10 and 13),
  responsible_address text not null check(length(btrim(responsible_address))>=3),
  notes text not null default '', active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(id,channel_id)
);
create table public.pipa_drivers (
  id uuid primary key default gen_random_uuid(), channel_id uuid not null references public.orgao_canais(id),
  user_id uuid unique references auth.users(id), name text not null check(length(btrim(name)) between 3 and 160),
  plate text not null check(plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  capacity_liters integer not null check(capacity_liters>0),
  provider text not null default 'prefeitura' check(provider in ('prefeitura','exercito')),
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,channel_id), unique(channel_id,plate)
);
create table public.pipa_quotas (
  driver_id uuid not null references public.pipa_drivers(id), month date not null check(extract(day from month)=1),
  loads integer not null check(loads>=0), updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
  primary key(driver_id,month)
);
create table public.pipa_requests (
  id uuid primary key default gen_random_uuid(), channel_id uuid not null references public.orgao_canais(id),
  tank_id uuid, driver_id uuid,
  kind text not null check(kind in ('regular','urgent','one_off')),
  status text not null default 'pending' check(status in ('pending','assigned','in_transit','completed','cancelled')),
  requester_name text not null check(length(btrim(requester_name))>=3), requester_phone text not null default '',
  locality text not null check(length(btrim(locality))>=2), address text not null default '',
  latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180),
  notes text not null default '', created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
  foreign key(tank_id,channel_id) references public.pipa_tanks(id,channel_id),
  foreign key(driver_id,channel_id) references public.pipa_drivers(id,channel_id),
  check(tank_id is not null or kind='one_off'),
  check(status in ('pending','cancelled') or driver_id is not null), unique(id,channel_id)
);
create unique index pipa_one_trip_per_driver on public.pipa_requests(driver_id) where status='in_transit';
create table public.pipa_deliveries (
  id uuid primary key, channel_id uuid not null references public.orgao_canais(id), tank_id uuid, driver_id uuid not null,
  request_id uuid unique, delivered_at timestamptz not null,
  loads integer not null check(loads between 1 and 1000), liters integer not null check(liters>0),
  provider text not null check(provider in ('prefeitura','exercito')), source text not null check(source in ('gps','manual')),
  locality text not null, destination_name text not null, driver_name text not null, plate text not null, capacity_liters integer not null,
  latitude double precision, longitude double precision, accuracy_m double precision,
  notes text not null default '', recorded_by uuid not null default auth.uid() references auth.users(id), recorded_at timestamptz not null default now(),
  foreign key(tank_id,channel_id) references public.pipa_tanks(id,channel_id),
  foreign key(driver_id,channel_id) references public.pipa_drivers(id,channel_id),
  foreign key(request_id,channel_id) references public.pipa_requests(id,channel_id),
  check(tank_id is not null or request_id is not null)
);
create index pipa_tanks_channel on public.pipa_tanks(channel_id);
create index pipa_drivers_channel on public.pipa_drivers(channel_id);
create index pipa_requests_channel_status on public.pipa_requests(channel_id,status,created_at desc);
create index pipa_deliveries_channel_date on public.pipa_deliveries(channel_id,delivered_at desc);
create index pipa_deliveries_driver_date on public.pipa_deliveries(driver_id,delivered_at desc);
alter table public.pipa_tanks enable row level security;
alter table public.pipa_drivers enable row level security;
alter table public.pipa_quotas enable row level security;
alter table public.pipa_requests enable row level security;
alter table public.pipa_deliveries enable row level security;
revoke all on public.pipa_tanks,public.pipa_drivers,public.pipa_quotas,public.pipa_requests,public.pipa_deliveries from public,anon,authenticated;
grant select on public.pipa_tanks,public.pipa_drivers,public.pipa_quotas,public.pipa_requests,public.pipa_deliveries to authenticated;
create policy pipa_tanks_read on public.pipa_tanks for select to authenticated using(public.pipa_can(channel_id));
create policy pipa_drivers_read on public.pipa_drivers for select to authenticated using(public.pipa_can(channel_id));
create policy pipa_quotas_read on public.pipa_quotas for select to authenticated using(exists(select 1 from public.pipa_drivers d where d.id=driver_id and public.pipa_can(d.channel_id)));
create policy pipa_requests_read on public.pipa_requests for select to authenticated using(public.pipa_can(channel_id));
create policy pipa_deliveries_read on public.pipa_deliveries for select to authenticated using(public.pipa_can(channel_id));

create function public.pipa_access(p_city bigint) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.nome,'manage',public.pipa_can(c.id,'manage'),'request',public.pipa_can(c.id,'request'))),'[]'::jsonb)
  from public.orgao_canais c where c.city_id=p_city and public.pipa_can(c.id)
$$;
create function public.pipa_save_tank(p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid=coalesce((p_data->>'id')::uuid,gen_random_uuid()); v_channel uuid=(p_data->>'channel_id')::uuid;
begin
  if not public.pipa_can(v_channel,'manage') then raise exception 'Sem permissão para cadastrar caixas nesta secretaria.' using errcode='42501'; end if;
  if exists(select 1 from public.pipa_tanks where id=v_id and channel_id<>v_channel) then raise exception 'Caixa de outra secretaria.' using errcode='42501'; end if;
  insert into public.pipa_tanks(id,channel_id,name,locality,address,latitude,longitude,capacity_liters,provider,responsible_name,responsible_document,responsible_phone,responsible_address,notes,active)
  values(v_id,v_channel,btrim(p_data->>'name'),btrim(p_data->>'locality'),coalesce(p_data->>'address',''),(p_data->>'latitude')::float8,(p_data->>'longitude')::float8,
    (p_data->>'capacity_liters')::integer,p_data->>'provider',btrim(p_data->>'responsible_name'),regexp_replace(p_data->>'responsible_document','\D','','g'),p_data->>'responsible_phone',p_data->>'responsible_address',coalesce(p_data->>'notes',''),coalesce((p_data->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,locality=excluded.locality,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,
    capacity_liters=excluded.capacity_liters,provider=excluded.provider,responsible_name=excluded.responsible_name,responsible_document=excluded.responsible_document,
    responsible_phone=excluded.responsible_phone,responsible_address=excluded.responsible_address,notes=excluded.notes,active=excluded.active,updated_at=now()
    where pipa_tanks.channel_id=excluded.channel_id;
  if not found then raise exception 'Caixa de outra secretaria.' using errcode='42501'; end if;
  return v_id;
end $$;
create function public.pipa_save_driver(p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid=coalesce((p_data->>'id')::uuid,gen_random_uuid()); v_channel uuid=(p_data->>'channel_id')::uuid;
begin
  if not public.pipa_can(v_channel,'manage') then raise exception 'Sem permissão para cadastrar pipeiros.' using errcode='42501'; end if;
  if exists(select 1 from public.pipa_drivers where id=v_id and channel_id<>v_channel) then raise exception 'Pipeiro de outra secretaria.' using errcode='42501'; end if;
  insert into public.pipa_drivers(id,channel_id,name,plate,capacity_liters,provider,active)
  values(v_id,v_channel,btrim(p_data->>'name'),upper(regexp_replace(p_data->>'plate','[^a-zA-Z0-9]','','g')),(p_data->>'capacity_liters')::integer,p_data->>'provider',coalesce((p_data->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,plate=excluded.plate,capacity_liters=excluded.capacity_liters,provider=excluded.provider,active=excluded.active,updated_at=now()
    where pipa_drivers.channel_id=excluded.channel_id;
  if not found then raise exception 'Pipeiro de outra secretaria.' using errcode='42501'; end if;
  return v_id;
end $$;
create function public.pipa_set_quota(p_driver uuid,p_month date,p_loads integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.pipa_drivers d where d.id=p_driver and public.pipa_can(d.channel_id,'manage')) then raise exception 'Sem permissão para definir cota.' using errcode='42501'; end if;
  insert into public.pipa_quotas(driver_id,month,loads,updated_by) values(p_driver,p_month,p_loads,auth.uid())
  on conflict(driver_id,month) do update set loads=excluded.loads,updated_by=auth.uid(),updated_at=now();
end $$;
create function public.pipa_create_request(p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_channel uuid=(p_data->>'channel_id')::uuid; v_tank public.pipa_tanks; v_id uuid;
begin
  if not public.pipa_can(v_channel,'request') then raise exception 'Sem permissão para solicitar abastecimento.' using errcode='42501'; end if;
  if nullif(p_data->>'tank_id','') is not null then
    select * into v_tank from public.pipa_tanks where id=(p_data->>'tank_id')::uuid and channel_id=v_channel and active;
    if not found then raise exception 'Caixa indisponível.'; end if;
  end if;
  insert into public.pipa_requests(channel_id,tank_id,kind,requester_name,requester_phone,locality,address,latitude,longitude,notes)
  values(v_channel,v_tank.id,p_data->>'kind',p_data->>'requester_name',coalesce(p_data->>'requester_phone',''),coalesce(v_tank.locality,p_data->>'locality'),
    coalesce(v_tank.address,p_data->>'address',''),coalesce(v_tank.latitude,(p_data->>'latitude')::float8),coalesce(v_tank.longitude,(p_data->>'longitude')::float8),coalesce(p_data->>'notes','')) returning id into v_id;
  return v_id;
end $$;
create function public.pipa_dispatch(p_request uuid,p_driver uuid default null,p_cancel boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.pipa_requests;
begin
  select * into r from public.pipa_requests where id=p_request for update;
  if not found or not public.pipa_can(r.channel_id,'manage') then raise exception 'Sem permissão para direcionar esta solicitação.' using errcode='42501'; end if;
  if r.status in ('completed','cancelled') then raise exception 'Solicitação já encerrada.'; end if;
  if not p_cancel and r.status='in_transit' then raise exception 'Entrega em andamento. Cancele antes de redirecionar.'; end if;
  if not p_cancel and not exists(select 1 from public.pipa_drivers where id=p_driver and channel_id=r.channel_id and active) then raise exception 'Selecione um pipeiro ativo desta secretaria.'; end if;
  update public.pipa_requests set driver_id=case when p_cancel then driver_id else p_driver end,status=case when p_cancel then 'cancelled' else 'assigned' end where id=r.id;
end $$;

-- Apenas esta projeção é disponibilizada ao pipeiro, inclusive após um bloqueio
-- de conta: ativo=false sempre impede destinos, viagens e confirmações.
create function public.pipa_driver_workspace() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.pipa_drivers; v_month date=date_trunc('month',now() at time zone 'America/Fortaleza')::date;
begin
  select x.* into d from public.pipa_drivers x join public.orgao_canais c on c.id=x.channel_id
    join public.prefeituras p on p.city_id=c.city_id and p.status='ativa'
    where x.user_id=auth.uid() and x.active and c.ativo and 'water_supply'=any(c.municipal_modules);
  if not found then raise exception 'Acesso de pipeiro indisponível. Consulte a secretaria.' using errcode='42501'; end if;
  return jsonb_build_object('driver',to_jsonb(d)-'user_id','quota',(select loads from public.pipa_quotas where driver_id=d.id and month=v_month),
    'monthly_loads',(select coalesce(sum(loads),0) from public.pipa_deliveries where driver_id=d.id and delivered_at>=v_month::timestamp at time zone 'America/Fortaleza' and delivered_at<(v_month+interval '1 month') at time zone 'America/Fortaleza'),
    'tanks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'locality',t.locality,'address',t.address,'latitude',t.latitude,'longitude',t.longitude,'provider',t.provider)) from public.pipa_tanks t where t.channel_id=d.channel_id and t.active),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(r)-'requester_name'-'requester_phone'-'created_by'-'notes' order by r.created_at) from public.pipa_requests r where r.driver_id=d.id and r.status in ('assigned','in_transit')),'[]'::jsonb),
    'deliveries',coalesce((select jsonb_agg(to_jsonb(x)-'recorded_by') from (select * from public.pipa_deliveries where driver_id=d.id order by delivered_at desc limit 100) x),'[]'::jsonb));
end $$;
create function public.pipa_start_trip(p_tank uuid default null,p_request uuid default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.pipa_drivers; r public.pipa_requests; t public.pipa_tanks;
begin
  perform public.pipa_driver_workspace();
  select * into d from public.pipa_drivers where user_id=auth.uid() and active for update;
  select * into r from public.pipa_requests where driver_id=d.id and status='in_transit';
  if found then return r.id; end if;
  if p_request is not null then
    select * into r from public.pipa_requests where id=p_request and driver_id=d.id and channel_id=d.channel_id and status='assigned' for update;
    if not found then raise exception 'Solicitação indisponível para este pipeiro.'; end if;
    update public.pipa_requests set status='in_transit',started_at=now() where id=r.id;
    return r.id;
  end if;
  select * into t from public.pipa_tanks where id=p_tank and channel_id=d.channel_id and active;
  if not found then raise exception 'Selecione uma caixa ativa desta secretaria.'; end if;
  insert into public.pipa_requests(channel_id,tank_id,driver_id,kind,status,requester_name,locality,address,latitude,longitude,started_at)
    values(d.channel_id,t.id,d.id,'regular','in_transit',d.name,t.locality,t.address,t.latitude,t.longitude,now()) returning id into r.id;
  return r.id;
end $$;
create function public.pipa_record_delivery(p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid=(p_data->>'id')::uuid; d public.pipa_drivers; t public.pipa_tanks; r public.pipa_requests;
  v_channel uuid; v_gps boolean=coalesce(p_data->>'source','')='gps'; v_time timestamptz;
  v_loads integer; v_liters integer; v_lat float8; v_lng float8; v_accuracy float8; v_distance float8;
begin
  if auth.uid() is null or v_id is null then raise exception 'Entre novamente para registrar.' using errcode='42501'; end if;
  if v_gps then
    perform public.pipa_driver_workspace();
    select * into d from public.pipa_drivers where user_id=auth.uid() and active for update;
  else
    select * into d from public.pipa_drivers where id=(p_data->>'driver_id')::uuid for update;
    if not found or not public.pipa_can(d.channel_id,'manage') then raise exception 'Sem permissão para lançar abastecimento manual.' using errcode='42501'; end if;
  end if;
  v_channel=d.channel_id;
  if exists(select 1 from public.pipa_deliveries where id=v_id and channel_id=v_channel and recorded_by=auth.uid()) then return v_id; end if;
  if exists(select 1 from public.pipa_deliveries where id=v_id) then raise exception 'Identificador já utilizado.'; end if;
  if nullif(p_data->>'request_id','') is not null then
    select * into r from public.pipa_requests where id=(p_data->>'request_id')::uuid and channel_id=v_channel for update;
    if not found or r.status in ('completed','cancelled') then raise exception 'Solicitação indisponível ou já atendida.'; end if;
    if r.driver_id is not null and r.driver_id<>d.id then raise exception 'Solicitação atribuída a outro pipeiro.'; end if;
    if v_gps and (r.driver_id is distinct from d.id or r.status<>'in_transit') then raise exception 'Inicie o deslocamento antes de confirmar.'; end if;
  elsif v_gps then raise exception 'Inicie o deslocamento antes de confirmar.';
  end if;
  select * into t from public.pipa_tanks where id=coalesce(r.tank_id,nullif(p_data->>'tank_id','')::uuid) and channel_id=v_channel;
  if t.id is null and r.id is null then raise exception 'Selecione um destino desta secretaria.'; end if;
  if r.id is not null and nullif(p_data->>'tank_id','')::uuid is not null and (p_data->>'tank_id')::uuid is distinct from r.tank_id then raise exception 'Destino diferente da solicitação.'; end if;
  if v_gps then
    v_time=now(); v_loads=1;
    v_lat=(p_data->>'latitude')::float8; v_lng=(p_data->>'longitude')::float8; v_accuracy=(p_data->>'accuracy_m')::float8;
    if v_lat is null or v_lng is null or v_accuracy is null or not(v_lat between -90 and 90) or not(v_lng between -180 and 180) or not(v_accuracy between 0 and 100) then raise exception 'GPS impreciso. Aguarde uma precisão de até 100 metros.'; end if;
    v_distance=6371000*2*asin(sqrt(least(1.0,power(sin(radians(v_lat-r.latitude)/2),2)+cos(radians(r.latitude))*cos(radians(v_lat))*power(sin(radians(v_lng-r.longitude)/2),2))));
    if v_distance>250 then raise exception 'Aproxime-se do destino (até 250 metros) para registrar a descarga.'; end if;
  else
    if length(btrim(coalesce(p_data->>'notes','')))<5 then raise exception 'Informe o motivo do lançamento manual.'; end if;
    v_time=(p_data->>'delivered_at')::timestamptz; v_loads=(p_data->>'loads')::integer;
    if v_time is null or v_time>now()+interval '1 minute' or v_time<date '2000-01-01' then raise exception 'Informe uma data de abastecimento válida, sem data futura.'; end if;
  end if;
  v_liters=(p_data->>'liters')::integer;
  if r.id is not null and v_loads<>1 then raise exception 'Cada solicitação corresponde a uma carrada.'; end if;
  if v_loads is null or v_loads not between 1 and 1000 or v_liters is null or v_liters<=0 or v_liters::bigint>v_loads::bigint*d.capacity_liters then raise exception 'Volume incompatível com a quantidade de carradas e a capacidade do veículo.'; end if;
  insert into public.pipa_deliveries(id,channel_id,tank_id,driver_id,request_id,delivered_at,loads,liters,provider,source,locality,destination_name,driver_name,plate,capacity_liters,latitude,longitude,accuracy_m,notes)
  values(v_id,v_channel,t.id,d.id,r.id,v_time,v_loads,v_liters,d.provider,case when v_gps then 'gps' else 'manual' end,
    coalesce(r.locality,t.locality),coalesce(t.name,nullif(r.address,''),r.locality),d.name,d.plate,d.capacity_liters,v_lat,v_lng,v_accuracy,coalesce(p_data->>'notes',''));
  if r.id is not null then update public.pipa_requests set status='completed',driver_id=d.id,completed_at=v_time where id=r.id; end if;
  return v_id;
end $$;

-- O vínculo de login nunca vem de um campo editável do cliente. A Edge Function
-- cria uma conta nova e a marca em app_metadata antes desta associação atômica.
create function public.pipa_validate_driver_account(p_driver uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.pipa_drivers d where d.id=p_driver and d.active and d.user_id is null and public.pipa_can(d.channel_id,'manage')) then raise exception 'Sem permissão ou pipeiro já possui login.' using errcode='42501'; end if;
end $$;
create function public.pipa_link_driver_account(p_driver uuid,p_user uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.pipa_validate_driver_account(p_driver);
  perform 1 from public.pipa_drivers where id=p_driver for update;
  perform public.pipa_validate_driver_account(p_driver);
  if not exists(select 1 from auth.users where id=p_user and raw_app_meta_data->>'pipa_created_by'=auth.uid()::text and raw_app_meta_data->>'pipa_driver'='true') then raise exception 'Conta indisponível para vinculação.' using errcode='42501'; end if;
  update public.pipa_drivers set user_id=p_user,updated_at=now() where id=p_driver;
  insert into public.municipal_account_setup(user_id,created_by) values(p_user,auth.uid());
end $$;

-- Todas as escritas passam pelas RPCs; nenhum cliente altera entregas e auditoria.
revoke all on function public.pipa_can(uuid,text),public.pipa_access(bigint),public.pipa_save_tank(jsonb),public.pipa_save_driver(jsonb),
  public.pipa_set_quota(uuid,date,integer),public.pipa_create_request(jsonb),public.pipa_dispatch(uuid,uuid,boolean),
  public.pipa_driver_workspace(),public.pipa_start_trip(uuid,uuid),public.pipa_record_delivery(jsonb),
  public.pipa_validate_driver_account(uuid),public.pipa_link_driver_account(uuid,uuid) from public,anon;
grant execute on function public.pipa_can(uuid,text),public.pipa_access(bigint),public.pipa_save_tank(jsonb),public.pipa_save_driver(jsonb),
  public.pipa_set_quota(uuid,date,integer),public.pipa_create_request(jsonb),public.pipa_dispatch(uuid,uuid,boolean),
  public.pipa_driver_workspace(),public.pipa_start_trip(uuid,uuid),public.pipa_record_delivery(jsonb),
  public.pipa_validate_driver_account(uuid),public.pipa_link_driver_account(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
