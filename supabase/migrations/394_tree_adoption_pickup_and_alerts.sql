begin;

create function public.valid_tree_pickup_details(details jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare period jsonb; day jsonb; previous jsonb; periods jsonb; seen jsonb='[]'; field text;
begin
  if details is null then return true; end if;
  if jsonb_typeof(details)<>'object' or length(details::text)>8000 then return false; end if;
  foreach field in array array['address','notes','legacy_hours'] loop
    if details ? field and jsonb_typeof(details->field)<>'string' then return false; end if;
  end loop;
  if length(coalesce(details->>'address',''))>300 or length(coalesce(details->>'notes',''))>1000 or length(coalesce(details->>'legacy_hours',''))>1000 then return false; end if;
  if coalesce(details->'latitude','null')<>'null' or coalesce(details->'longitude','null')<>'null' then
    if jsonb_typeof(details->'latitude') is distinct from 'number' or jsonb_typeof(details->'longitude') is distinct from 'number' then return false; end if;
    if (details->>'latitude')::numeric not between -90 and 90 or (details->>'longitude')::numeric not between -180 and 180 then return false; end if;
  end if;
  periods=coalesce(details->'schedule','[]');
  if jsonb_typeof(periods)<>'array' or jsonb_array_length(periods)>14 then return false; end if;
  for period in select value from jsonb_array_elements(periods) loop
    if jsonb_typeof(period)<>'object' or jsonb_typeof(period->'days') is distinct from 'array' then return false; end if;
    if jsonb_array_length(period->'days') not between 1 and 7
      or coalesce(period->>'from','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(period->>'to','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or period->>'from'>=period->>'to' then return false; end if;
    for day in select value from jsonb_array_elements(period->'days') loop
      if jsonb_typeof(day)<>'number' or day::text !~ '^[0-6]$' then return false; end if;
      for previous in select value from jsonb_array_elements(seen) loop
        if previous->'day'=day and period->>'from'<previous->>'to' and period->>'to'>previous->>'from' then return false; end if;
      end loop;
      seen=seen||jsonb_build_array(jsonb_build_object('day',day,'from',period->>'from','to',period->>'to'));
    end loop;
  end loop;
  return true;
end $$;

alter table public.tree_species_availability add column pickup_details jsonb
  constraint tree_availability_pickup_valid check(public.valid_tree_pickup_details(pickup_details));
-- Mantém instruções legíveis para os clientes anteriores; os campos separados
-- ficam no JSON, sem tentar adivinhar dias/horas de textos antigos.
alter table public.tree_species_availability drop constraint tree_species_availability_instructions_check;
alter table public.tree_species_availability add constraint tree_species_availability_instructions_check check(length(instructions)<=5000);

create table public.tree_adoption_availability_alerts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  city_id bigint not null references public.cities(id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key(user_id,city_id)
);
create index tree_adoption_pending_alerts on public.tree_adoption_availability_alerts(city_id) where notified_at is null;
alter table public.tree_adoption_availability_alerts enable row level security;
revoke all on public.tree_adoption_availability_alerts from public,anon,authenticated;
grant select on public.tree_adoption_availability_alerts to authenticated;
create policy tree_adoption_alerts_own on public.tree_adoption_availability_alerts for select to authenticated using(user_id=auth.uid());

create function public.set_tree_adoption_availability_alert(p_city bigint,p_enabled boolean default true) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para ativar o aviso.' using errcode='42501'; end if;
  -- O mesmo bloqueio é usado ao notificar: cadastrar o aviso e liberar as mudas
  -- simultaneamente não pode deixar alguém esperando por uma oferta já aberta.
  perform 1 from public.cities where id=p_city for update;
  if not found then raise exception 'Selecione uma cidade válida.' using errcode='23514'; end if;
  if p_enabled is distinct from true then
    delete from public.tree_adoption_availability_alerts where user_id=auth.uid() and city_id=p_city;
    return jsonb_build_object('enabled',false,'available',false);
  end if;
  if exists(select 1 from public.tree_species_availability a join public.city_tree_species s on s.id=a.species_id where s.city_id=p_city and a.status='disponivel') then
    return jsonb_build_object('enabled',false,'available',true);
  end if;
  insert into public.tree_adoption_availability_alerts(user_id,city_id) values(auth.uid(),p_city)
    on conflict(user_id,city_id) do update set notified_at=null,
      created_at=case when tree_adoption_availability_alerts.notified_at is null then tree_adoption_availability_alerts.created_at else now() end;
  return jsonb_build_object('enabled',true,'available',false);
end $$;
revoke all on function public.set_tree_adoption_availability_alert(bigint,boolean) from public,anon;
grant execute on function public.set_tree_adoption_availability_alert(bigint,boolean) to authenticated;

create function public.notify_tree_adoption_availability() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint; v_name text;
begin
  if new.status<>'disponivel' then return new; end if;
  if tg_op='UPDATE' and old.status='disponivel' then return new; end if;
  select city_id into v_city from public.city_tree_species where id=new.species_id;
  select name into v_name from public.cities where id=v_city for update;
  with recipients as (
    update public.tree_adoption_availability_alerts set notified_at=now()
    where city_id=v_city and notified_at is null returning user_id
  )
  insert into public.notifications(user_id,type,title,message,link,is_read,created_at)
    select user_id,'system','Mudas disponíveis para adoção',
      'Há mudas disponíveis em '||coalesce(v_name,'sua cidade')||'. Consulte as espécies e os fornecedores no programa Adote uma árvore.',
      '/adote-uma-arvore?cidade='||v_city,false,now() from recipients;
  return new;
end $$;
revoke all on function public.notify_tree_adoption_availability() from public,anon,authenticated;
create trigger tree_adoption_notify_available after insert or update of status on public.tree_species_availability
  for each row execute function public.notify_tree_adoption_availability();

notify pgrst,'reload schema';
commit;
