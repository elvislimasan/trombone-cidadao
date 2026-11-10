begin;

create table public.pipa_routes (
  id uuid primary key, channel_id uuid not null references public.orgao_canais(id),
  driver_id uuid not null, name text not null check(length(btrim(name)) between 2 and 100),
  scheduled_date date not null, source text not null check(source in ('municipality','driver')),
  cancelled boolean not null default false, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), unique(id,channel_id,driver_id),
  foreign key(driver_id,channel_id) references public.pipa_drivers(id,channel_id)
);
alter table public.pipa_requests add column route_id uuid, add column route_position integer;
alter table public.pipa_requests add constraint pipa_request_route_fk foreign key(route_id,channel_id,driver_id) references public.pipa_routes(id,channel_id,driver_id);
alter table public.pipa_requests add constraint pipa_route_position_valid check((route_id is null and route_position is null) or (route_id is not null and route_position>0));
create unique index pipa_route_order on public.pipa_requests(route_id,route_position) where route_id is not null;
create unique index pipa_route_tank on public.pipa_requests(route_id,tank_id) where route_id is not null;
create index pipa_routes_driver on public.pipa_routes(driver_id,scheduled_date);
alter table public.pipa_routes enable row level security;
revoke all on public.pipa_routes from public,anon,authenticated;
grant select on public.pipa_routes to authenticated;
create policy pipa_routes_read on public.pipa_routes for select to authenticated using(public.pipa_can(channel_id));

create function public.pipa_plan_route(p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.pipa_drivers; t public.pipa_tanks; v_id uuid=(p_data->>'id')::uuid;
  v_tanks uuid[]; v_tank uuid; v_position integer=0; v_manager boolean; v_source text;
begin
  if auth.uid() is null or v_id is null then raise exception 'Entre novamente para planejar.' using errcode='42501'; end if;
  select * into d from public.pipa_drivers where id=(p_data->>'driver_id')::uuid and active for update;
  if not found then raise exception 'Selecione um pipeiro ativo.'; end if;
  v_manager=public.pipa_can(d.channel_id,'manage');
  if not v_manager then
    perform public.pipa_driver_workspace();
    if d.user_id is distinct from auth.uid() then raise exception 'Sem permissão para planejar esta rota.' using errcode='42501'; end if;
  end if;
  v_source=case when v_manager then 'municipality' else 'driver' end;
  if exists(select 1 from public.pipa_routes where id=v_id and driver_id=d.id and created_by=auth.uid()) then return v_id; end if;
  if jsonb_typeof(p_data->'tank_ids') is distinct from 'array' then raise exception 'Selecione as caixas da rota.'; end if;
  select array_agg(value::uuid) into v_tanks from jsonb_array_elements_text(p_data->'tank_ids');
  if coalesce(cardinality(v_tanks),0) not between 1 and 100 or cardinality(v_tanks)<>(select count(distinct x) from unnest(v_tanks) x) then raise exception 'Selecione entre 1 e 100 caixas, sem repetir.'; end if;
  if (p_data->>'scheduled_date')::date is null or (p_data->>'scheduled_date')::date<(now() at time zone 'America/Fortaleza')::date then raise exception 'Escolha hoje ou uma data futura.'; end if;
  insert into public.pipa_routes(id,channel_id,driver_id,name,scheduled_date,source,created_by)
    values(v_id,d.channel_id,d.id,btrim(p_data->>'name'),(p_data->>'scheduled_date')::date,v_source,auth.uid());
  foreach v_tank in array v_tanks loop
    select * into t from public.pipa_tanks where id=v_tank and channel_id=d.channel_id and active for share;
    if not found then raise exception 'Selecione somente caixas ativas da secretaria do pipeiro.'; end if;
    v_position=v_position+1;
    insert into public.pipa_requests(channel_id,tank_id,driver_id,kind,status,requester_name,locality,address,latitude,longitude,route_id,route_position)
      values(d.channel_id,t.id,d.id,'regular','assigned',d.name,t.locality,t.address,t.latitude,t.longitude,v_id,v_position);
  end loop;
  return v_id;
end $$;

create function public.pipa_cancel_route(p_route uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.pipa_routes;
begin
  -- A mesma ordem de bloqueio das viagens e confirmações evita concorrência.
  perform 1 from public.pipa_drivers where id=(select driver_id from public.pipa_routes where id=p_route) for update;
  select * into r from public.pipa_routes where id=p_route for update;
  if not found then raise exception 'Rota indisponível.'; end if;
  if not public.pipa_can(r.channel_id,'manage') then
    perform public.pipa_driver_workspace();
    if r.source<>'driver' or r.created_by is distinct from auth.uid() then raise exception 'Sem permissão para cancelar esta rota.' using errcode='42501'; end if;
  end if;
  if exists(select 1 from public.pipa_requests where route_id=r.id and status='in_transit') then raise exception 'Conclua ou troque o destino da entrega em andamento antes de cancelar a rota.'; end if;
  update public.pipa_requests set status='cancelled' where route_id=r.id and status='assigned';
  update public.pipa_routes set cancelled=true where id=r.id;
end $$;

create or replace function public.pipa_driver_workspace() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.pipa_drivers; v_month date=date_trunc('month',now() at time zone 'America/Fortaleza')::date;
begin
  select x.* into d from public.pipa_drivers x join public.orgao_canais c on c.id=x.channel_id
    join public.prefeituras p on p.city_id=c.city_id and p.status='ativa'
    where x.user_id=auth.uid() and x.active and c.ativo and 'water_supply'=any(c.municipal_modules);
  if not found then raise exception 'Acesso de pipeiro indisponível. Consulte a secretaria.' using errcode='42501'; end if;
  return jsonb_build_object('driver',to_jsonb(d)-'user_id','quota',(select loads from public.pipa_quotas where driver_id=d.id and month=v_month),
    'monthly_loads',(select coalesce(sum(loads),0) from public.pipa_deliveries where driver_id=d.id and delivered_at>=v_month::timestamp at time zone 'America/Fortaleza' and delivered_at<(v_month+interval '1 month') at time zone 'America/Fortaleza'),
    'tanks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'locality',t.locality,'address',t.address,'latitude',t.latitude,'longitude',t.longitude,'provider',t.provider)) from public.pipa_tanks t where t.channel_id=d.channel_id and t.active),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(r)-'requester_name'-'requester_phone'-'created_by'-'notes' order by r.created_at,r.route_position) from public.pipa_requests r where r.driver_id=d.id and r.status in ('assigned','in_transit')),'[]'::jsonb),
    'routes',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'scheduled_date',p.scheduled_date,'source',p.source,'cancelled',p.cancelled,'stops',
      coalesce((select jsonb_agg(jsonb_build_object('request_id',r.id,'tank_id',r.tank_id,'status',r.status,'position',r.route_position) order by r.route_position) from public.pipa_requests r where r.route_id=p.id and r.driver_id=d.id),'[]'::jsonb)) order by p.scheduled_date desc,p.created_at desc) from public.pipa_routes p where p.driver_id=d.id),'[]'::jsonb),
    'deliveries',coalesce((select jsonb_agg(to_jsonb(x)-'recorded_by') from (select * from public.pipa_deliveries where driver_id=d.id order by delivered_at desc limit 100) x),'[]'::jsonb));
end $$;

-- Trocar o destino não dá baixa na parada anterior. Ela continua direcionada.
create function public.pipa_change_destination(p_tank uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.pipa_drivers; r public.pipa_requests; v_request uuid;
begin
  perform public.pipa_driver_workspace();
  select * into d from public.pipa_drivers where user_id=auth.uid() and active for update;
  if not exists(select 1 from public.pipa_tanks where id=p_tank and channel_id=d.channel_id and active) then raise exception 'Selecione uma caixa ativa desta secretaria.'; end if;
  select * into r from public.pipa_requests where driver_id=d.id and status='in_transit' for update;
  if found and r.tank_id=p_tank then return r.id; end if;
  if r.id is not null then update public.pipa_requests set status='assigned',started_at=null where id=r.id; end if;
  select id into v_request from public.pipa_requests where driver_id=d.id and tank_id=p_tank and status='assigned' order by route_id nulls last,route_position,created_at limit 1;
  return public.pipa_start_trip(p_tank,v_request);
end $$;

revoke all on function public.pipa_plan_route(jsonb),public.pipa_cancel_route(uuid),public.pipa_change_destination(uuid) from public,anon;
grant execute on function public.pipa_plan_route(jsonb),public.pipa_cancel_route(uuid),public.pipa_change_destination(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
