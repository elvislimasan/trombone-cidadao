begin;

create table public.tree_nurseries (
  id uuid primary key default gen_random_uuid(),
  city_id bigint not null references public.cities(id),
  provider text not null default gen_random_uuid()::text,
  name text not null check(length(trim(name)) between 3 and 160),
  pickup_details jsonb constraint tree_nursery_pickup_valid check(public.valid_tree_pickup_details(pickup_details)),
  instructions text check(length(instructions)<=5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_id,provider)
);
create unique index tree_nurseries_city_name on public.tree_nurseries(city_id,lower(trim(name)));
alter table public.tree_nurseries enable row level security;
revoke all on public.tree_nurseries from public,anon,authenticated;
grant select on public.tree_nurseries to anon,authenticated;
grant insert(city_id,name,pickup_details,instructions),update(name,pickup_details,instructions) on public.tree_nurseries to authenticated;
create policy tree_nurseries_read on public.tree_nurseries for select using(true);
create policy tree_nurseries_insert on public.tree_nurseries for insert to authenticated
  with check(public.can_manage_tree_adoption(city_id));
create policy tree_nurseries_update on public.tree_nurseries for update to authenticated
  using(public.can_manage_tree_adoption(city_id)) with check(public.can_manage_tree_adoption(city_id));
create trigger tree_nurseries_touch before update on public.tree_nurseries
  for each row execute function public.touch_city_tree();

alter table public.tree_species_availability
  drop constraint tree_species_availability_provider_check,
  add column nursery_id uuid references public.tree_nurseries(id);
alter table public.tree_adoption_requests
  drop constraint tree_adoption_requests_provider_check,
  drop constraint tree_adoption_requests_confirmed_provider_check;

-- Preserva locais/horários diferentes como viveiros separados, sem escolher
-- um endereço de uma espécie para sobrescrever o endereço de outra.
create temporary table nursery_legacy_locations on commit drop as
with locations as (
  select s.city_id,a.provider as legacy_provider,a.pickup_details,
    case when a.pickup_details is null then a.instructions end as legacy_instructions,
    max(a.instructions) as instructions,max(a.updated_at) as updated_at
  from public.tree_species_availability a join public.city_tree_species s on s.id=a.species_id
  group by s.city_id,a.provider,a.pickup_details,case when a.pickup_details is null then a.instructions end
)
select gen_random_uuid() as id,*,row_number() over(partition by city_id,legacy_provider
  order by updated_at desc,pickup_details::text nulls last,legacy_instructions nulls last) as location_number
from locations;

insert into public.tree_nurseries(id,city_id,provider,name,pickup_details,instructions)
select id,city_id,case when location_number=1 then legacy_provider else id::text end,
  (case legacy_provider when 'viveiro_municipal' then 'Viveiro municipal' when 'instituto_florestar' then 'Instituto Florestar' else 'Viveiro' end)
    ||case when location_number>1 then ' · Local '||location_number::text else '' end,
  pickup_details,instructions from nursery_legacy_locations;

create temporary table nursery_legacy_species on commit drop as
select a.species_id,a.provider as legacy_provider,n.id as nursery_id,n.provider
from public.tree_species_availability a join public.city_tree_species s on s.id=a.species_id
join nursery_legacy_locations l on l.city_id=s.city_id and l.legacy_provider=a.provider
  and l.pickup_details is not distinct from a.pickup_details
  and l.legacy_instructions is not distinct from (case when a.pickup_details is null then a.instructions end)
join public.tree_nurseries n on n.id=l.id;

update public.tree_species_availability a set nursery_id=m.nursery_id,provider=m.provider
from nursery_legacy_species m where a.species_id=m.species_id and a.provider=m.legacy_provider;

-- Os pedidos existentes continuam apontando para o local da espécie original.
update public.tree_adoption_requests r set
  provider=coalesce((select m.provider from nursery_legacy_species m where m.species_id=r.species_id and m.legacy_provider=r.provider),r.provider),
  confirmed_provider=coalesce((select m.provider from nursery_legacy_species m where m.species_id=r.approved_species_id and m.legacy_provider=r.confirmed_provider),r.confirmed_provider),
  items=(select jsonb_agg(jsonb_set(i.item,'{provider}',to_jsonb(coalesce(m.provider,i.item->>'provider'))) order by i.ordinal)
    from jsonb_array_elements(r.items) with ordinality as i(item,ordinal)
    left join nursery_legacy_species m on m.species_id=(i.item->>'species_id')::uuid and m.legacy_provider=i.item->>'provider');

-- Inclui fornecedores que só aparecem no histórico, mesmo sem ofertas atuais.
insert into public.tree_nurseries(city_id,provider,name)
select distinct p.city_id,p.provider,
  case p.provider when 'viveiro_municipal' then 'Viveiro municipal' when 'instituto_florestar' then 'Instituto Florestar' else 'Viveiro '||p.provider end
from (
  select city_id,provider from public.tree_adoption_requests
  union select city_id,confirmed_provider from public.tree_adoption_requests where confirmed_provider is not null
  union select r.city_id,i.item->>'provider' from public.tree_adoption_requests r cross join lateral jsonb_array_elements(r.items) i(item)
) p where not exists(select 1 from public.tree_nurseries n where n.city_id=p.city_id and n.provider=p.provider);

alter table public.tree_species_availability alter column nursery_id set not null;
create index tree_species_availability_nursery on public.tree_species_availability(nursery_id);
alter table public.tree_adoption_requests
  add constraint adoption_request_nursery foreign key(city_id,provider) references public.tree_nurseries(city_id,provider),
  add constraint adoption_confirmed_nursery foreign key(city_id,confirmed_provider) references public.tree_nurseries(city_id,provider);

-- Compatibilidade com os clientes anteriores: as colunas de retirada de cada
-- oferta são sempre derivadas do viveiro, inclusive em gravações diretas.
create function public.inherit_tree_nursery_pickup() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare n public.tree_nurseries; v_city bigint;
begin
  select city_id into v_city from public.city_tree_species where id=new.species_id;
  if new.nursery_id is null then
    select * into n from public.tree_nurseries where city_id=v_city and provider=new.provider for share;
  else
    select * into n from public.tree_nurseries where id=new.nursery_id and city_id=v_city and provider=new.provider for share;
  end if;
  if n.id is null then raise exception 'Selecione um viveiro cadastrado na cidade da espécie.' using errcode='23514'; end if;
  new.nursery_id=n.id;
  new.pickup_details=n.pickup_details;
  new.instructions=n.instructions;
  return new;
end $$;
revoke all on function public.inherit_tree_nursery_pickup() from public,anon,authenticated;
create trigger tree_availability_inherit_nursery before insert or update on public.tree_species_availability
  for each row execute function public.inherit_tree_nursery_pickup();

create function public.sync_tree_nursery_pickup() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.tree_species_availability set pickup_details=new.pickup_details,instructions=new.instructions where nursery_id=new.id;
  return new;
end $$;
revoke all on function public.sync_tree_nursery_pickup() from public,anon,authenticated;
create trigger tree_nursery_sync_pickup after update of pickup_details,instructions on public.tree_nurseries
  for each row when(old.pickup_details is distinct from new.pickup_details or old.instructions is distinct from new.instructions)
  execute function public.sync_tree_nursery_pickup();

comment on table public.tree_nurseries is 'Viveiros da cidade: local e dias de atendimento compartilhados por todas as espécies oferecidas';
comment on column public.tree_species_availability.nursery_id is 'Viveiro responsável pela oferta e pelos dados fixos de retirada';

create or replace function public.update_tree_adoption(p_id uuid,p_expected_status text,p_status text,p_message text,p_details jsonb default '{}')
returns public.tree_adoption_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.tree_adoption_requests; v_staff boolean; v_tree uuid; v_item jsonb; v_index integer; v_species uuid; v_provider text;
begin
  select * into r from public.tree_adoption_requests where id=p_id for update;
  if not found or auth.uid() is null then raise exception 'Solicitação indisponível.' using errcode='42501'; end if;
  v_staff=public.can_manage_tree_adoption(r.city_id);
  if not v_staff and r.author_id<>auth.uid() then raise exception 'Sem permissão nesta cidade.' using errcode='42501'; end if;
  if r.status is distinct from p_expected_status then raise exception 'O pedido foi atualizado por outra pessoa. Atualize a lista antes de continuar.'; end if;
  if r.status in ('concluida','recusada','cancelada') then raise exception 'Este pedido já foi encerrado.'; end if;
  if p_status is null or p_message is null or length(trim(p_message)) not between 5 and 3000 then raise exception 'Descreva a atualização (5 a 3000 caracteres).'; end if;
  if not v_staff then
    if p_status<>'cancelada' and not(p_status=r.status and r.status='aguardando_informacao') then
      raise exception 'Você pode cancelar o pedido ou responder à equipe quando houver informação pendente.' using errcode='42501'; end if;
  else
    if p_status=r.status then
      update public.tree_adoption_requests set updated_at=now() where id=r.id returning * into r;
      insert into public.tree_adoption_events(request_id,author_id,status,message) values(r.id,auth.uid(),r.status,trim(p_message));
      return r;
    end if;
    if p_status in ('aprovada','agendada','pronta_retirada','concluida','recusada','cancelada')
      and not public.can_dispatch_tree_adoption(r.city_id)
      and not(p_status='cancelada' and r.author_id=auth.uid()) then
      raise exception 'Esta etapa exige um gestor de arborização ou da secretaria responsável.' using errcode='42501'; end if;
    if p_status not in ('solicitada','em_analise','aguardando_informacao','aguardando_disponibilidade','aprovada','agendada','pronta_retirada','concluida','recusada','cancelada') then
      raise exception 'Status invalido.' using errcode='23514';
    end if;
    if (p_status='agendada' and r.request_type<>'plantio') or (p_status='pronta_retirada' and r.request_type<>'muda') then
      raise exception 'Status incompativel com o tipo de atendimento.' using errcode='23514';
    end if;
    if p_status<>'agendada' then r.scheduled_at=null; end if;
    if p_status='aprovada' or (p_status in ('agendada','pronta_retirada','concluida') and r.approved_species_id is null) then
      r.approved_species_id=coalesce(nullif(p_details->>'species_id','')::uuid,r.species_id);
      if jsonb_array_length(r.items)>1 then r.approved_species_id=r.species_id; end if;
      r.confirmed_provider=coalesce(nullif(p_details->>'provider',''),r.provider);
      if jsonb_array_length(r.items)>1 then r.confirmed_provider=r.provider; end if;
      if not exists(select 1 from public.city_tree_species where id=r.approved_species_id and city_id=r.city_id)
        or r.confirmed_provider is null or not exists(select 1 from public.tree_nurseries where city_id=r.city_id and provider=r.confirmed_provider) then
        raise exception 'Confirme a espécie e o fornecedor para aprovar.'; end if;
      for v_item in select value from jsonb_array_elements(r.items) loop
        v_species=case when jsonb_array_length(r.items)=1 then r.approved_species_id else (v_item->>'species_id')::uuid end;
        v_provider=case when jsonb_array_length(r.items)=1 then r.confirmed_provider else v_item->>'provider' end;
        perform 1 from public.city_tree_species where id=v_species and city_id=r.city_id;
        if not found then raise exception 'Espécie fora do catálogo desta cidade.' using errcode='23514'; end if;
        perform 1 from public.tree_species_availability where species_id=v_species and provider=v_provider and status='disponivel' for share;
        if not found then raise exception 'Confirme a disponibilidade de todas as espécies nos viveiros escolhidos.' using errcode='23514'; end if;
      end loop;
      if exists(select 1 from public.tree_species_availability where species_id=r.approved_species_id and provider=r.confirmed_provider and status='indisponivel') then
        raise exception 'A espécie confirmada está indisponível neste fornecedor.'; end if;
    end if;
    if p_status='agendada' then
      r.scheduled_at=nullif(p_details->>'scheduled_at','')::timestamptz;
      if r.scheduled_at is null or r.scheduled_at<=now() then raise exception 'Informe uma data futura para o plantio.'; end if;
    end if;
    if p_status in ('agendada','pronta_retirada','concluida') and (r.approved_species_id is null or r.confirmed_provider is null) then
      raise exception 'A espécie e o fornecedor precisam estar confirmados.'; end if;
    if p_status='concluida' then
      r.fulfilled_on=nullif(p_details->>'fulfilled_on','')::date;
      if r.fulfilled_on is null or r.fulfilled_on>(now() at time zone 'America/Fortaleza')::date
        or r.fulfilled_on<(r.created_at at time zone 'America/Fortaleza')::date then
        raise exception 'Informe a data real do atendimento, entre a solicitação e hoje.'; end if;
      if r.request_type='plantio' then
        for v_item in select value from jsonb_array_elements(r.items) loop
        v_species=case when jsonb_array_length(r.items)=1 then r.approved_species_id else (v_item->>'species_id')::uuid end;
        for v_index in 1..(v_item->>'quantity')::integer loop
        insert into public.city_trees(city_id,species_id,bairro_id,common_name,latitude,longitude,address,planted_at,planted_by,notes,adoption_request_id)
          values(r.city_id,v_species,(select id from public.bairros where city_id=r.city_id
            and public.tree_catalog_key(name)=public.tree_catalog_key(r.neighborhood) order by id limit 1),
            'Não identificada',r.latitude,r.longitude,r.address,r.fulfilled_on,'prefeitura',
            'Plantio realizado pelo programa Adote uma árvore. Pedido '||r.id::text,r.id) returning id into v_tree;
        r.tree_id=coalesce(r.tree_id,v_tree);
        end loop;
        end loop;
      end if;
    end if;
  end if;
  update public.tree_adoption_requests set status=p_status,approved_species_id=r.approved_species_id,confirmed_provider=r.confirmed_provider,
    scheduled_at=r.scheduled_at,fulfilled_on=r.fulfilled_on,tree_id=r.tree_id,updated_at=now() where id=r.id returning * into r;
  insert into public.tree_adoption_events(request_id,author_id,status,message) values(r.id,auth.uid(),r.status,trim(p_message));
  return r;
end $$;
notify pgrst,'reload schema';
commit;
